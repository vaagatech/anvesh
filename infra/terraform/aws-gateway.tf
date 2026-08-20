# AWS API Gateway (HTTP API v2) with Cognito JWT Authorizer and OCI NLB Secure Integration

# HTTP API Gateway
resource "aws_apigatewayv2_api" "k3s_aws_gateway" {
  name          = "k3s-secure-m2m-gateway"
  protocol_type = "HTTP"
  description   = "Secure API Gateway frontend for OCI K3s cluster with Cognito M2M auth"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["*"]
    allow_headers = ["*"]
    expose_headers = ["*"]
    max_age       = 3600
  }

  tags = {
    Environment = "Production"
    Project     = "OCI-K3s-Platform"
    ManagedBy   = "Terraform"
  }
}

# Auto-deploy default stage
resource "aws_apigatewayv2_stage" "default_stage" {
  api_id      = aws_apigatewayv2_api.k3s_aws_gateway.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gateway_logs.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      ip             = "$context.identity.sourceIp"
      requestTime    = "$context.requestTime"
      httpMethod     = "$context.httpMethod"
      routeKey       = "$context.routeKey"
      status         = "$context.status"
      protocol       = "$context.protocol"
      responseLength = "$context.responseLength"
      errorMessage   = "$context.error.message"
      authorizerUser = "$context.authorizer.claims.sub"
      client_id      = "$context.authorizer.claims.client_id"
    })
  }
}

# CloudWatch Log Group for API Gateway Access Logs
resource "aws_cloudwatch_log_group" "api_gateway_logs" {
  name              = "/aws/apigateway/k3s-secure-gateway-logs"
  retention_in_days = 7
}

# Cognito JWT Authorizer
resource "aws_apigatewayv2_authorizer" "cognito_jwt" {
  api_id           = aws_apigatewayv2_api.k3s_aws_gateway.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "cognito-m2m-jwt-authorizer"

  jwt_configuration {
    audience = [
      aws_cognito_user_pool_client.m2m_client.id,
      aws_cognito_user_pool_client.ui_client.id
    ]
    issuer = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.m2m_pool.id}"
  }
}

# Secure HTTPS Proxy Integration to OCI NLB
# Injects the secret X-Origin-Verify header so K3s Traefik blocks unauthorized public bypass
resource "aws_apigatewayv2_integration" "oci_nlb_link" {
  api_id                 = aws_apigatewayv2_api.k3s_aws_gateway.id
  integration_type       = "HTTP_PROXY"
  integration_method     = "ANY"
  integration_uri        = "http://${var.origin_subdomain}.${var.domain_name}/{proxy}"
  payload_format_version = "1.0"

  request_parameters = {
    "overwrite:header.X-Origin-Verify" = random_password.origin_verify_secret.result
  }
}

# Catch-all route for all downstream application endpoints (e.g., /anvesh/..., /orders/...)
# Authorizes any valid JWT issued by Cognito User Pool for either M2M or UI client
resource "aws_apigatewayv2_route" "default_route" {
  api_id             = aws_apigatewayv2_api.k3s_aws_gateway.id
  route_key          = "ANY /{proxy+}"
  target             = "integrations/${aws_apigatewayv2_integration.oci_nlb_link.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito_jwt.id
}

# Dedicated unauthenticated OPTIONS route for CORS preflights
resource "aws_apigatewayv2_route" "options_route" {
  api_id             = aws_apigatewayv2_api.k3s_aws_gateway.id
  route_key          = "OPTIONS /{proxy+}"
  target             = "integrations/${aws_apigatewayv2_integration.oci_nlb_link.id}"
  authorization_type = "NONE"
}

# ACM Certificate for Custom API Domain (api.vaagatech.com) in us-east-1
resource "aws_acm_certificate" "api_gw_cert" {
  domain_name       = "${var.api_subdomain}.${var.domain_name}"
  validation_method = "DNS"

  tags = {
    Name        = "API Gateway Certificate"
    Environment = "Production"
    Project     = "Anvesh-SearchEngine"
    ManagedBy   = "Terraform"
  }

  lifecycle {
    create_before_destroy = true
  }
}

# Note: aws_apigatewayv2_domain_name requires the ACM certificate to be ISSUED before creation.
# Once the ACM validation CNAME is created in GoDaddy and validated, enable these resources.
# resource "aws_apigatewayv2_domain_name" "api_custom_domain" {
#   domain_name = "${var.api_subdomain}.${var.domain_name}"
#   domain_name_configuration {
#     certificate_arn = aws_acm_certificate.api_gw_cert.arn
#     endpoint_type   = "REGIONAL"
#     security_policy = "TLS_1_2"
#   }
# }
# resource "aws_apigatewayv2_api_mapping" "api_mapping" {
#   api_id      = aws_apigatewayv2_api.k3s_aws_gateway.id
#   domain_name = aws_apigatewayv2_domain_name.api_custom_domain.id
#   stage       = aws_apigatewayv2_stage.default_stage.id
# }




