"""Аутентификация запросов к /api/tutor. Режим — переменная AUTH_MODE:

  oidc  — рабочий режим: токен доступа Keycloak (Authorization: Bearer …), проверка подписи по JWKS,
          издателя и аудитории. Нужен пакет PyJWT[crypto]. Псевдоним = HMAC(sub) — ФИО и e-mail в сервис не попадают.
  demo  — для прототипа: пользователь из демо-входа сайта (заголовки X-Ebook-Pseudonym / X-Ebook-Role).
          Заголовки ничем не подписаны, поэтому режим допустим только вместе с ограничением доступа
          к сайту на nginx (auth_basic или список IP) и лимитами запросов.
  off   — без входа, только для локальной разработки.
"""
import hashlib, hmac, os, re

ROLES = {"student", "teacher", "methodist", "expert", "admin", "mentor"}
AI_ROLES = {"student", "teacher", "methodist", "expert", "mentor"}  # как PERMS.ai в прототипе: администратору AI не нужен
TEACHER_MODE_ROLES = {"teacher", "methodist", "expert"}            # кому можно mode=teacher (видит экспертный комментарий)
REVIEW_ROLES = {"expert"}


class AuthError(Exception):
    def __init__(self, code, msg):
        super().__init__(msg)
        self.code = code


class Principal:
    def __init__(self, pseud, role):
        self.pseud, self.role = pseud, role


class Authenticator:
    def __init__(self, mode=None):
        self.mode = mode or os.environ.get("AUTH_MODE", "oidc")
        if self.mode not in ("oidc", "demo", "off"):
            raise ValueError("AUTH_MODE: oidc | demo | off")
        if self.mode == "oidc":
            import jwt  # PyJWT[crypto]
            self.jwt = jwt
            self.jwks = jwt.PyJWKClient(os.environ["OIDC_JWKS_URL"], cache_keys=True, lifespan=3600)
            self.issuer = os.environ["OIDC_ISSUER"]
            self.audience = os.environ.get("OIDC_AUDIENCE", "ebook")
            self.salt = os.environ["PSEUDONYM_SALT"].encode()

    def _role_from_claims(self, claims):
        roles = set((claims.get("realm_access") or {}).get("roles") or [])
        for client in (claims.get("resource_access") or {}).values():
            roles |= set(client.get("roles") or [])
        for r in ("expert", "methodist", "teacher", "mentor", "student", "admin"):  # от более широких прав к узким
            if r in roles:
                return r
        raise AuthError(403, "нет роли e-book в токене")

    def authenticate(self, headers):
        if self.mode == "off":
            return Principal("p-dev000", headers.get("X-Ebook-Role") if headers.get("X-Ebook-Role") in ROLES else "student")
        if self.mode == "demo":
            pseud, role = headers.get("X-Ebook-Pseudonym") or "", headers.get("X-Ebook-Role") or ""
            if not re.fullmatch(r"p-[0-9a-f]{6}", pseud) or role not in ROLES:
                raise AuthError(401, "нужен вход")
            return Principal(pseud, role)
        auth = headers.get("Authorization") or ""
        if not auth.startswith("Bearer "):
            raise AuthError(401, "нужен вход")
        token = auth[7:]
        try:
            key = self.jwks.get_signing_key_from_jwt(token).key
            claims = self.jwt.decode(token, key, algorithms=["RS256", "ES256"], audience=self.audience, issuer=self.issuer,
                                     options={"require": ["exp", "sub"]})
        except Exception:
            raise AuthError(401, "токен недействителен")
        pseud = "u-" + hmac.new(self.salt, claims["sub"].encode(), hashlib.sha256).hexdigest()[:12]
        return Principal(pseud, self._role_from_claims(claims))
