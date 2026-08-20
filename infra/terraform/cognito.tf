# AWS Cognito Configuration for M2M Client Credentials and Hub UI User Authentication

# Random secret token used to secure Gateway -> OCI NLB / Traefik origin communication
resource "random_password" "origin_verify_secret" {
  length  = 32
  special = false
}

# Suffix to ensure uniqueness for the Cognito hosted domain prefix
resource "random_string" "cognito_domain_suffix" {
  length  = 6
  special = false
  upper   = false
}

# Cognito User Pool for M2M Authentication and User Management
resource "aws_cognito_user_pool" "m2m_pool" {
  name = var.cognito_user_pool_name

  # Enable self-service sign up / registration from Web UI
  admin_create_user_config {
    allow_admin_create_user_only = false
  }

  # Auto-verify email for self-service users
  auto_verified_attributes = ["email"]

  # Enable self-service password recovery via verified email
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # Standard secure password policy
  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_symbols   = false
    require_uppercase = true
  }

  tags = {
    Environment = "Production"
    Project     = "OCI-K3s-Platform"
    ManagedBy   = "Terraform"
  }
}

# ── User Pool Groups for Role-Based Access Control (RBAC) ─────────────────────

resource "aws_cognito_user_group" "admin" {
  name         = "admin"
  user_pool_id = aws_cognito_user_pool.m2m_pool.id
  description  = "Anvesh Hub Administrator with full management privileges"
  precedence   = 1
}

resource "aws_cognito_user_group" "operator" {
  name         = "operator"
  user_pool_id = aws_cognito_user_pool.m2m_pool.id
  description  = "Anvesh Hub Operator with indexing and web spider controls"
  precedence   = 2
}

resource "aws_cognito_user_group" "viewer" {
  name         = "viewer"
  user_pool_id = aws_cognito_user_pool.m2m_pool.id
  description  = "Anvesh Hub Viewer with read-only search and audit access"
  precedence   = 3
}

# ── Cognito Hosted Domain ──────────────────────────────────────────────────────

resource "aws_cognito_user_pool_domain" "m2m_domain" {
  domain       = "${var.cognito_domain_prefix}-${random_string.cognito_domain_suffix.result}"
  user_pool_id = aws_cognito_user_pool.m2m_pool.id
}

# ── Resource Server for Machine-to-Machine Scopes ──────────────────────────────

resource "aws_cognito_resource_server" "k3s_resource_server" {
  identifier   = "https://${var.api_subdomain}.${var.domain_name}"
  name         = "K3s Applications Resource Server"
  user_pool_id = aws_cognito_user_pool.m2m_pool.id

  scope {
    scope_name        = "apps.read"
    scope_description = "Read access to K3s hosted microservices"
  }

  scope {
    scope_name        = "apps.write"
    scope_description = "Write access to K3s hosted microservices"
  }

  scope {
    scope_name        = "apps.all"
    scope_description = "Full administrative access to all K3s microservices"
  }
}

# ── 1. M2M App Client (OAuth 2.0 client_credentials flow) ─────────────────────

resource "aws_cognito_user_pool_client" "m2m_client" {
  name         = "k3s-m2m-app-client"
  user_pool_id = aws_cognito_user_pool.m2m_pool.id

  generate_secret = true

  allowed_oauth_flows                  = ["client_credentials"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes = [
    "${aws_cognito_resource_server.k3s_resource_server.identifier}/apps.read",
    "${aws_cognito_resource_server.k3s_resource_server.identifier}/apps.write",
    "${aws_cognito_resource_server.k3s_resource_server.identifier}/apps.all"
  ]
  supported_identity_providers = ["COGNITO"]

  depends_on = [aws_cognito_resource_server.k3s_resource_server]
}

# ── 2. Public Web UI App Client (User Password & SRP Auth for Browser SPA) ───

resource "aws_cognito_user_pool_client" "ui_client" {
  name         = "k3s-hub-ui-client"
  user_pool_id = aws_cognito_user_pool.m2m_pool.id

  generate_secret = false # Public client for Single Page Applications (no client secret)

  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH"
  ]

  prevent_user_existence_errors = "ENABLED"
}
