# =========================================================================
# OCI Object Storage for Anvesh Index Persistence & Snapshots
# S3-compatible multi-cloud durable storage tier
# =========================================================================

data "oci_objectstorage_namespace" "anvesh_ns" {
  compartment_id = var.tenancy_ocid
}

resource "oci_objectstorage_bucket" "anvesh_indexes_bucket" {
  compartment_id = var.tenancy_ocid
  name           = "anvesh-indexes-${random_string.s3_bucket_suffix.result}"
  namespace      = data.oci_objectstorage_namespace.anvesh_ns.namespace
  access_type    = "NoPublicAccess"
  versioning     = "Enabled"
  auto_tiering   = "Disabled"
  storage_tier   = "Standard"
}

resource "oci_identity_customer_secret_key" "anvesh_s3_key" {
  display_name = "anvesh-k3s-s3-key"
  user_id      = var.user_ocid
}
