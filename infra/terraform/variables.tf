variable "tenancy_ocid" {
  type        = string
  default     = "ocid1.tenancy.oc1..aaaaaaaabbx4l3smvhzdixnpnqiw7gc2zfplmdg2wixq7hkkbdv7lrq4mmta"
  description = "OCI Tenancy OCID"
}

variable "user_ocid" {
  type        = string
  default     = "ocid1.user.oc1..aaaaaaaa7wken6fxbgytw3r6xbhjiftiz4jvfuzyiu6yxcoqcpuqirtcjaoa"
  description = "OCI User OCID"
}

variable "fingerprint" {
  type        = string
  default     = "82:1a:8a:a5:6f:a7:dd:05:50:08:8f:b2:01:9b:79:8c"
  description = "Fingerprint of OCI API signing key"
}

variable "private_key_path" {
  type        = string
  default     = "~/.oci/oci_api_key.pem"
  description = "Path to OCI API private key file"
}

variable "region" {
  type        = string
  default     = "ap-hyderabad-1"
  description = "OCI Region (e.g., ap-hyderabad-1)"
}

variable "ssh_public_key" {
  type        = string
  default     = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQDL1w6oxYn06EtZ4+tcUyTZ314AR+JjBCpHze06E264wdfjUPCpVPql+I9VnN9aY3yKaVYG89Kh5Ux2wJbCoSMJ9QxMmEx9m5D1D5L0UibOPUMeM7r3nNPVTR/d7IMGEzdo498xEictfXko/fomYcyjlqCyx08+cVhBsX8KqSxzXrqy+R0Jrf3rClcG78JqA41feZkkBARkgKpYPHy3sN+jOYJAzgmZJk6Te3HesfAo9Tx5pOBCwQ5DecFmbRnZRGuKZVbZMH1u0DYe33LEzT6Po0LREyhuz9M3125fRTQTO7v78efBe8tb4D8aG6kj24Z+ETD6s412d/6Sg+AlF3yOICS6TU3yVY9+Xg81SfZRa1esSqagtOyQTeR1QvqSd5QcT+LQXGsB5Mb/k1LuAhzBYX5/B8fzOZxVufd6M+aVn27/H6/HfZXdVxhsbFlHKc7tJgRnpDGzsPe4GKvViuVxlyMLqcZWbUnnReHhfiVV26tWufnrMszD3b3aBuG193M= karthiksp@Karthiks-MacBook-Air.local"
  description = "SSH public key string to inject into VMs"
}

variable "ssh_private_key_path" {
  type        = string
  default     = "~/.ssh/id_rsa"
  description = "Path to the local private key corresponding to ssh_public_key"
}

variable "domain_name" {
  type        = string
  default     = "vaagatech.com"
  description = "Primary domain name (e.g. vaagatech.com)"
}

variable "aws_access_key" {
  type        = string
  default     = ""
  description = "AWS Access Key ID"
}

variable "aws_secret_key" {
  type        = string
  default     = ""
  description = "AWS Secret Access Key"
}

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
