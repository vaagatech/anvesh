# Consolidated Terraform Outputs

output "k3s_master_public_ip" {
  description = "Public IP address of the K3s Master compute instance in OCI"
  value       = oci_core_instance.k3s_master.public_ip
}

output "k3s_master_private_ip" {
  description = "Private IP address of the K3s Master inside OCI VCN"
  value       = oci_core_instance.k3s_master.private_ip
}

output "k3s_worker_arm_public_ip" {
  description = "Public IP address of Worker 1 (ARM64)"
  value       = oci_core_instance.k3s_worker_arm.public_ip
}

output "k3s_worker_amd1_public_ip" {
  description = "Public IP address of Worker 2 (AMD64 Micro 1)"
  value       = oci_core_instance.k3s_worker_amd1.public_ip
}

output "k3s_worker_amd2_public_ip" {
  description = "Public IP address of Worker 3 (AMD64 Micro 2)"
  value       = oci_core_instance.k3s_worker_amd2.public_ip
}

output "oci_nlb_public_ip" {
  description = "Public IP address of the OCI Free Tier Network Load Balancer"
  value       = oci_network_load_balancer_network_load_balancer.k3s_free_nlb.ip_addresses[0].ip_address
}

output "aws_api_gateway_endpoint" {
  description = "Direct AWS API Gateway execute-api URL"
  value       = aws_apigatewayv2_api.k3s_aws_gateway.api_endpoint
}

output "public_api_custom_url" {
  description = "Public Custom Domain URL for the API Gateway"
  value       = "https://${var.api_subdomain}.${var.domain_name}"
}

output "k3s_origin_secure_url" {
  description = "Direct HTTPS URL of the OCI NLB origin"
  value       = "https://${var.origin_subdomain}.${var.domain_name}"
}

output "cognito_user_pool_id" {
  description = "ID of the AWS Cognito User Pool"
  value       = aws_cognito_user_pool.m2m_pool.id
}

output "cognito_token_endpoint" {
  description = "OAuth 2.0 Token Endpoint URL for M2M authentication"
  value       = "https://${aws_cognito_user_pool_domain.m2m_domain.domain}.auth.${var.aws_region}.amazoncognito.com/oauth2/token"
}

output "cognito_m2m_client_id" {
  description = "OAuth 2.0 Client ID for Machine-to-Machine authentication"
  value       = aws_cognito_user_pool_client.m2m_client.id
}

output "cognito_m2m_client_secret" {
  description = "OAuth 2.0 Client Secret for Machine-to-Machine authentication"
  value       = aws_cognito_user_pool_client.m2m_client.client_secret
  sensitive   = true
}

output "cognito_ui_client_id" {
  description = "Public Client ID for Web UI (SPA) user authentication"
  value       = aws_cognito_user_pool_client.ui_client.id
}

output "cognito_region" {
  description = "AWS Region for Cognito User Pool"
  value       = var.aws_region
}

output "origin_verification_secret" {
  description = "Shared secret token injected by API Gateway and verified by K3s Traefik Ingress Middleware"
  value       = random_password.origin_verify_secret.result
  sensitive   = true
}

output "resource_server_identifier" {
  description = "Resource Server Scope Identifier"
  value       = aws_cognito_resource_server.k3s_resource_server.identifier
}

output "search_ui_custom_url" {
  description = "Custom domain URL for Search UI (CloudFront + S3)"
  value       = "https://${var.search_ui_subdomain}.${var.domain_name}"
}

output "search_ui_s3_bucket" {
  description = "Name of the S3 bucket hosting Search UI assets"
  value       = aws_s3_bucket.search_ui.id
}

output "search_ui_cloudfront_distribution_id" {
  description = "CloudFront Distribution ID for Search UI (used for invalidations)"
  value       = aws_cloudfront_distribution.search_ui.id
}

output "search_ui_cloudfront_domain_name" {
  description = "Direct CloudFront domain name for Search UI"
  value       = aws_cloudfront_distribution.search_ui.domain_name
}

output "anvesh_api_url" {
  description = "API Gateway endpoint for Anvesh Search Engine on K3s"
  value       = "${aws_apigatewayv2_api.k3s_aws_gateway.api_endpoint}/anvesh"
}

output "acm_certificate_validation_dns_record" {
  description = "DNS validation CNAME to create in GoDaddy for the ACM SSL certificate"
  value = {
    for dvo in concat(
      tolist(aws_acm_certificate.search_ui_cert.domain_validation_options),
      tolist(aws_acm_certificate.api_gw_cert.domain_validation_options)
    ) : dvo.domain_name => {
      type   = dvo.resource_record_type
      name   = dvo.resource_record_name
      target = dvo.resource_record_value
    }
  }
}

output "godaddy_dns_configuration_guide" {
  description = "Summary of DNS records to add into GoDaddy DNS Management for vaagatech.com"
  value       = <<-EOT
    ================================================================================
    GoDaddy DNS Records to Configure for vaagatech.com:
    ================================================================================

    1. Search UI Frontend (search.vaagatech.com):
       Type:   CNAME
       Name:   search
       Value:  ${aws_cloudfront_distribution.search_ui.domain_name}
       TTL:    1 Hour (or default)

    2. ACM Certificate Validation (for search.vaagatech.com & api.vaagatech.com):
       See 'acm_certificate_validation_dns_record' output for exact CNAME records.

    3. OCI NLB Origin Direct Access (origin-k3s.vaagatech.com):
       Type:   A
       Name:   origin-k3s
       Value:  ${oci_network_load_balancer_network_load_balancer.k3s_free_nlb.ip_addresses[0].ip_address}
       TTL:    1 Hour (or default)

    ================================================================================
  EOT
}

output "quickstart_m2m_test_curl" {
  description = "Bash command to acquire Cognito JWT token and query multi-application endpoints"
  value       = <<-EOT
    # 1. Fetch Cognito M2M Access Token:
    TOKEN=$(curl -s -X POST "https://${aws_cognito_user_pool_domain.m2m_domain.domain}.auth.${var.aws_region}.amazoncognito.com/oauth2/token" \
      -H "Content-Type: application/x-www-form-urlencoded" \
      -u "${aws_cognito_user_pool_client.m2m_client.id}:<CLIENT_SECRET>" \
      -d "grant_type=client_credentials&scope=${aws_cognito_resource_server.k3s_resource_server.identifier}/apps.all" | jq -r .access_token)

    # 2. Call Anvesh Search Engine via API Gateway:
    curl -i -H "Authorization: Bearer $TOKEN" "https://${var.api_subdomain}.${var.domain_name}/anvesh/health"

    # 3. Call Orders Service via API Gateway:
    curl -i -H "Authorization: Bearer $TOKEN" "https://${var.api_subdomain}.${var.domain_name}/orders"
  EOT
}

# =========================================================================
# OCI Object Storage Outputs
# =========================================================================
output "oci_objectstorage_bucket_name" {
  description = "OCI Object Storage bucket name for Anvesh index persistence"
  value       = oci_objectstorage_bucket.anvesh_indexes_bucket.name
}

output "oci_objectstorage_namespace" {
  description = "OCI Object Storage namespace"
  value       = data.oci_objectstorage_namespace.anvesh_ns.namespace
}

output "oci_objectstorage_s3_endpoint" {
  description = "S3-compatible endpoint for OCI Object Storage"
  value       = "https://${data.oci_objectstorage_namespace.anvesh_ns.namespace}.compat.objectstorage.${var.region}.oraclecloud.com"
}

output "oci_s3_access_key_id" {
  description = "Access key ID for S3-compatible OCI Object Storage"
  value       = oci_identity_customer_secret_key.anvesh_s3_key.id
}

output "oci_s3_secret_access_key" {
  description = "Secret access key for S3-compatible OCI Object Storage"
  value       = oci_identity_customer_secret_key.anvesh_s3_key.key
  sensitive   = true
}

