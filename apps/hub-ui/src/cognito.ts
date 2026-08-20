/**
 * AWS Cognito Identity Provider REST Client for Anvesh Hub UI
 * Native browser implementation using standard Cognito IDP endpoints.
 */

export interface CognitoAuthConfig {
  region: string;
  userPoolId: string;
  clientId: string;
}

export function getCognitoConfig(): CognitoAuthConfig {
  return {
    region: import.meta.env.VITE_COGNITO_REGION ?? "us-east-1",
    userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID || "us-east-1_29n2CzOwE",
    clientId: import.meta.env.VITE_COGNITO_CLIENT_ID || "4r9m9ebme0ec4j1dj6taigpgu4",
  };
}

export function isCognitoConfigured(): boolean {
  const cfg = getCognitoConfig();
  return Boolean(cfg.userPoolId && cfg.clientId);
}

async function cognitoRequest(target: string, body: Record<string, unknown>): Promise<any> {
  const cfg = getCognitoConfig();
  if (!cfg.clientId) {
    throw new Error("Cognito Client ID is not configured (missing VITE_COGNITO_CLIENT_ID).");
  }

  const endpoint = `https://cognito-idp.${cfg.region}.amazonaws.com/`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": `AWSCognitoIdentityProviderService.${target}`,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json.message || json.__type || `Cognito error (${res.status})`;
    throw new Error(msg);
  }
  return json;
}

export interface CognitoTokens {
  accessToken: string;
  idToken: string;
  refreshToken?: string;
  expiresIn?: number;
}

export interface CognitoUserClaims {
  sub: string;
  username: string;
  email?: string;
  groups: string[];
  role: "admin" | "operator" | "viewer";
}

/** Decode JWT payload without external libraries */
export function parseJwt(token: string): Record<string, any> {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );
    return JSON.parse(jsonPayload);
  } catch {
    return {};
  }
}

/** Extract user profile and role from Cognito IdToken and AccessToken */
export function extractUserClaims(idToken: string, accessToken?: string): CognitoUserClaims {
  const idClaims = parseJwt(idToken);
  const accessClaims = accessToken ? parseJwt(accessToken) : {};

  const groups: string[] = (idClaims["cognito:groups"] || accessClaims["cognito:groups"] || []);
  let role: "admin" | "operator" | "viewer" = "viewer";

  if (groups.includes("admin")) {
    role = "admin";
  } else if (groups.includes("operator")) {
    role = "operator";
  } else if (groups.includes("viewer")) {
    role = "viewer";
  } else {
    // If user has no explicit group assigned, default to admin if solitary or viewer
    role = "admin";
  }

  const username =
    idClaims["cognito:username"] ||
    idClaims["username"] ||
    idClaims["email"] ||
    accessClaims["username"] ||
    "user";

  return {
    sub: idClaims.sub || accessClaims.sub || "",
    username,
    email: idClaims.email,
    groups,
    role,
  };
}

/** 1. Sign In / Login */
export async function cognitoLogin(username: string, password: string): Promise<CognitoTokens> {
  const cfg = getCognitoConfig();
  const data = await cognitoRequest("InitiateAuth", {
    AuthFlow: "USER_PASSWORD_AUTH",
    ClientId: cfg.clientId,
    AuthParameters: {
      USERNAME: username,
      PASSWORD: password,
    },
  });

  const authResult = data.AuthenticationResult;
  if (!authResult) {
    if (data.ChallengeName) {
      throw new Error(`Cognito challenge required: ${data.ChallengeName}`);
    }
    throw new Error("Login failed: no tokens returned.");
  }

  return {
    accessToken: authResult.AccessToken,
    idToken: authResult.IdToken,
    refreshToken: authResult.RefreshToken,
    expiresIn: authResult.ExpiresIn,
  };
}

/** 2. Register / Sign Up */
export async function cognitoRegister(
  username: string,
  password: string,
  email: string,
): Promise<{ userConfirmed: boolean; userSub: string }> {
  const cfg = getCognitoConfig();
  const data = await cognitoRequest("SignUp", {
    ClientId: cfg.clientId,
    Username: username,
    Password: password,
    UserAttributes: [
      { Name: "email", Value: email },
    ],
  });

  return {
    userConfirmed: Boolean(data.UserConfirmed),
    userSub: data.UserSub,
  };
}

/** 3. Confirm Sign Up with verification code */
export async function cognitoConfirmRegister(username: string, code: string): Promise<void> {
  const cfg = getCognitoConfig();
  await cognitoRequest("ConfirmSignUp", {
    ClientId: cfg.clientId,
    Username: username,
    ConfirmationCode: code,
  });
}

/** 4. Resend Confirmation Code */
export async function cognitoResendCode(username: string): Promise<void> {
  const cfg = getCognitoConfig();
  await cognitoRequest("ResendConfirmationCode", {
    ClientId: cfg.clientId,
    Username: username,
  });
}

/** 5. Forgot Password — Request reset code */
export async function cognitoForgotPassword(username: string): Promise<any> {
  const cfg = getCognitoConfig();
  return cognitoRequest("ForgotPassword", {
    ClientId: cfg.clientId,
    Username: username,
  });
}

/** 6. Confirm Forgot Password — Set new password with code */
export async function cognitoConfirmForgotPassword(
  username: string,
  code: string,
  newPassword: string,
): Promise<void> {
  const cfg = getCognitoConfig();
  await cognitoRequest("ConfirmForgotPassword", {
    ClientId: cfg.clientId,
    Username: username,
    ConfirmationCode: code,
    Password: newPassword,
  });
}

/** 7. Change Password (while authenticated) */
export async function cognitoChangePassword(
  accessToken: string,
  previousPassword: string,
  proposedPassword: string,
): Promise<void> {
  await cognitoRequest("ChangePassword", {
    AccessToken: accessToken,
    PreviousPassword: previousPassword,
    ProposedPassword: proposedPassword,
  });
}
