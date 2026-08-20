variable "tenancy_ocid" {
  type        = string
  description = "OCI Tenancy OCID"
}

variable "user_ocid" {
  type        = string
  description = "OCI User OCID"
}

variable "fingerprint" {
  type        = string
  description = "Fingerprint of OCI API signing key"
}

variable "private_key_path" {
  type        = string
  description = "Path to OCI API private key file"
}

variable "region" {
  type        = string
  description = "OCI Region (e.g., us-ashburn-1)"
}

variable "ssh_public_key" {
  type        = string
  description = "SSH public key string to inject into VMs"
}

variable "ssh_private_key_path" {
  type        = string
  description = "Path to the local private key corresponding to ssh_public_key"
}

variable "domain_name" {
  type        = string
  description = "Primary domain name (e.g. vaagatech.com)"
}
variable "aws_access_key" { type = string }
variable "aws_secret_key" { type = string }
variable "aws_region" {
  type        = string
  default     = "us-east-1"
  description = "AWS region for API Gateway, Route 53, and Cognito"
}

variable "cognito_user_pool_name" {
  type        = string
  default     = "k3s-m2m-user-pool"
  description = "Name of the AWS Cognito User Pool for M2M auth"
}

variable "cognito_domain_prefix" {
  type        = string
  default     = "k3s-auth"
  description = "Prefix for AWS Cognito Hosted Domain token endpoint"
}

variable "api_subdomain" {
  type        = string
  default     = "api"
  description = "Subdomain for AWS API Gateway (e.g. api.vaagatech.com)"
}

variable "origin_subdomain" {
  type        = string
  default     = "origin-k3s"
  description = "Subdomain pointing directly to OCI NLB (e.g. origin-k3s.vaagatech.com)"
}

variable "search_ui_subdomain" {
  type        = string
  default     = "search"
  description = "Subdomain for the Search UI (e.g. search.vaagatech.com)"
}
