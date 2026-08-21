# =========================================================================
# OCI Compute Instances Configuration (Multi-Node Multi-Arch K3s Cluster)
# 1 Control Plane (ARM64) + 3 Worker Nodes (1 ARM64 + 2 AMD64 Micro)
# =========================================================================

data "oci_identity_availability_domains" "ads" {
  compartment_id = var.tenancy_ocid
}

# Dynamic OS Image Lookups for Ubuntu 22.04
data "oci_core_images" "ubuntu_amd64" {
  compartment_id           = var.tenancy_ocid
  operating_system         = "Canonical Ubuntu"
  operating_system_version = "22.04"
  shape                    = "VM.Standard.E2.1.Micro"
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}

data "oci_core_images" "ubuntu_arm64" {
  compartment_id           = var.tenancy_ocid
  operating_system         = "Canonical Ubuntu"
  operating_system_version = "22.04"
  shape                    = "VM.Standard.A1.Flex"
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}

# 1. Master ARM Node (Control Plane)
resource "oci_core_instance" "k3s_master" {
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[0].name
  compartment_id      = var.tenancy_ocid
  shape               = "VM.Standard.A1.Flex"
  display_name        = "k3s-master-arm"

  shape_config {
    ocpus         = 1
    memory_in_gbs = 6
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.k3s_subnet.id
    assign_public_ip = true
    display_name     = "k3s-master-vnic"
  }

  source_details {
    source_type             = "image"
    source_id               = data.oci_core_images.ubuntu_arm64.images[0].id
    boot_volume_size_in_gbs = 50
  }

  metadata = {
    ssh_authorized_keys = var.ssh_public_key
    user_data           = base64encode(file("${path.module}/../scripts/bootstrap-master.sh"))
  }

  lifecycle {
    ignore_changes = [metadata]
  }
}

# 2. Worker 1 ARM Node
resource "oci_core_instance" "k3s_worker_arm" {
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[0].name
  compartment_id      = var.tenancy_ocid
  shape               = "VM.Standard.A1.Flex"
  display_name        = "k3s-worker-arm"

  shape_config {
    ocpus         = 1
    memory_in_gbs = 6
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.k3s_subnet.id
    assign_public_ip = true
    display_name     = "k3s-worker-arm-vnic"
  }

  source_details {
    source_type             = "image"
    source_id               = data.oci_core_images.ubuntu_arm64.images[0].id
    boot_volume_size_in_gbs = 50
  }

  metadata = {
    ssh_authorized_keys = var.ssh_public_key
    user_data = base64encode(templatefile("${path.module}/../scripts/bootstrap-worker.sh", {
      master_ip = oci_core_instance.k3s_master.private_ip
    }))
  }
}

# 3. Worker 2 AMD Micro Node
resource "oci_core_instance" "k3s_worker_amd1" {
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[0].name
  compartment_id      = var.tenancy_ocid
  shape               = "VM.Standard.E2.1.Micro"
  display_name        = "k3s-worker-amd1"

  create_vnic_details {
    subnet_id        = oci_core_subnet.k3s_subnet.id
    assign_public_ip = true
    display_name     = "k3s-worker-amd1-vnic"
  }

  source_details {
    source_type             = "image"
    source_id               = data.oci_core_images.ubuntu_amd64.images[0].id
    boot_volume_size_in_gbs = 50
  }

  metadata = {
    ssh_authorized_keys = var.ssh_public_key
    user_data = base64encode(templatefile("${path.module}/../scripts/bootstrap-worker.sh", {
      master_ip = oci_core_instance.k3s_master.private_ip
    }))
  }
}

# 4. Worker 3 AMD Micro Node
resource "oci_core_instance" "k3s_worker_amd2" {
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[0].name
  compartment_id      = var.tenancy_ocid
  shape               = "VM.Standard.E2.1.Micro"
  display_name        = "k3s-worker-amd2"

  create_vnic_details {
    subnet_id        = oci_core_subnet.k3s_subnet.id
    assign_public_ip = true
    display_name     = "k3s-worker-amd2-vnic"
  }

  source_details {
    source_type             = "image"
    source_id               = data.oci_core_images.ubuntu_amd64.images[0].id
    boot_volume_size_in_gbs = 50
  }

  metadata = {
    ssh_authorized_keys = var.ssh_public_key
    user_data = base64encode(templatefile("${path.module}/../scripts/bootstrap-worker.sh", {
      master_ip = oci_core_instance.k3s_master.private_ip
    }))
  }
}
