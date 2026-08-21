terraform {
  required_providers {
    anvesh = {
      source  = "vaagatech/anvesh"
      version = "~> 0.4.0"
    }
  }
}

variable "anvesh_client_id" {
  type        = string
  description = "Cognito M2M Client ID"
  default     = "7e5437nbeefh5di9cve8g9b419"
}

variable "anvesh_client_secret" {
  type        = string
  description = "Cognito M2M Client Secret"
  sensitive   = true
}

provider "anvesh" {
  url           = "https://fgqza9ykw7.execute-api.us-east-1.amazonaws.com/anvesh"
  token_url     = "https://k3s-auth-3zhl7f.auth.us-east-1.amazoncognito.com/oauth2/token"
  client_id     = var.anvesh_client_id
  client_secret = var.anvesh_client_secret
}

resource "anvesh_index" "products" {
  name              = "products"
  vector_dimensions = 256
  auto_embed        = true
  dynamic_mapping   = true

  mapping {
    name = "name"
    type = "text"
  }
  mapping {
    name = "category"
    type = "keyword"
  }
  mapping {
    name = "tags"
    type = "keyword"
  }
  mapping {
    name = "price"
    type = "number"
  }
  mapping {
    name = "description"
    type = "text"
  }
}
