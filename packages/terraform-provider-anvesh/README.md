# Terraform Provider for Anvesh (`terraform-provider-anvesh`)

The official Terraform Provider enables declarative Infrastructure-as-Code management of Anvesh Search Engine resources without manual UI operations or pod redeployments.

---

## Provider Configuration

```hcl
terraform {
  required_providers {
    anvesh = {
      source  = "vaagatech/anvesh"
      version = "~> 0.4.0"
    }
  }
}

provider "anvesh" {
  url               = "https://fgqza9ykw7.execute-api.us-east-1.amazonaws.com/anvesh"
  token_url         = "https://k3s-auth-3zhl7f.auth.us-east-1.amazoncognito.com/oauth2/token"
  client_id         = var.anvesh_client_id
  client_secret     = var.anvesh_client_secret
  oauth_scope       = "https://api.vaagatech.com/apps.all"
}
```

---

## Supported Resources

### 1. `anvesh_index`
Declares search indexes with mappings, vector embeddings, and analyzer settings.

```hcl
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
    name = "price"
    type = "number"
  }

  mapping {
    name = "description"
    type = "text"
  }
}
```

### 2. `anvesh_spider_target`
Configures scheduled web crawls into an Anvesh index.

```hcl
resource "anvesh_spider_target" "docs_crawler" {
  name            = "documentation-crawler"
  target_url      = "https://docs.vaagatech.com"
  index_name      = anvesh_index.products.name
  max_depth       = 3
  max_pages       = 500
  allowed_domains = ["docs.vaagatech.com"]
  schedule_cron   = "0 2 * * *" # Daily at 2 AM
}
```

### 3. `anvesh_circuit_limits`
Manages runtime cluster limits and protection guardrails dynamically.

```hcl
resource "anvesh_circuit_limits" "production" {
  max_body_bytes        = 5242880
  max_concurrent_search = 64
  max_result_window     = 10000
}
```
