resource "oci_core_vcn" "k3s_vcn" {
  cidr_block     = "10.0.0.0/16"
  compartment_id = var.tenancy_ocid
  display_name   = "k3s-always-free-vcn"
  dns_label      = "k3svcn"
}

resource "oci_core_internet_gateway" "k3s_ig" {
  compartment_id = var.tenancy_ocid
  display_name   = "k3s-internet-gateway"
  vcn_id         = oci_core_vcn.k3s_vcn.id
}

resource "oci_core_route_table" "k3s_rt" {
  compartment_id = var.tenancy_ocid
  vcn_id         = oci_core_vcn.k3s_vcn.id
  display_name   = "k3s-route-table"

  route_rules {
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
    network_entity_id = oci_core_internet_gateway.k3s_ig.id
  }
}

resource "oci_core_security_list" "k3s_sl" {
  compartment_id = var.tenancy_ocid
  vcn_id         = oci_core_vcn.k3s_vcn.id
  display_name   = "k3s-security-list"

  egress_security_rules {
    destination      = "0.0.0.0/0"
    destination_type = "CIDR_BLOCK"
    protocol         = "all"
  }

  ingress_security_rules {
    description = "Allow SSH Access"
    protocol    = "6"
    source      = "0.0.0.0/0"
    source_type = "CIDR_BLOCK"
    tcp_options {
      min = 22
      max = 22
    }
  }

  ingress_security_rules {
    description = "Allow API Gateway Public HTTP Traffic"
    protocol    = "6"
    source      = "0.0.0.0/0"
    source_type = "CIDR_BLOCK"
    tcp_options {
      min = 80
      max = 80
    }
  }

  ingress_security_rules {
    description = "Allow API Gateway Public HTTPS Traffic"
    protocol    = "6"
    source      = "0.0.0.0/0"
    source_type = "CIDR_BLOCK"
    tcp_options {
      min = 443
      max = 443
    }
  }

  ingress_security_rules {
    description = "Allow Local MacBook kubectl Management Access"
    protocol    = "6"
    source      = "0.0.0.0/0"
    source_type = "CIDR_BLOCK"
    tcp_options {
      min = 6443
      max = 6443
    }
  }

  ingress_security_rules {
    description = "Allow Full Internal VCN Networking"
    protocol    = "all"
    source      = "10.0.0.0/16"
    source_type = "CIDR_BLOCK"
  }
}

resource "oci_core_subnet" "k3s_subnet" {
  cidr_block        = "10.0.1.0/24"
  compartment_id    = var.tenancy_ocid
  vcn_id            = oci_core_vcn.k3s_vcn.id
  display_name      = "k3s-public-subnet"
  dns_label         = "k3ssub"
  security_list_ids = [oci_core_security_list.k3s_sl.id]
  route_table_id    = oci_core_route_table.k3s_rt.id
}

resource "oci_network_load_balancer_network_load_balancer" "k3s_free_nlb" {
  compartment_id                 = var.tenancy_ocid
  display_name                   = "k3s-free-nlb"
  subnet_id                      = oci_core_subnet.k3s_subnet.id
  is_private                     = false
  is_preserve_source_destination = false
}

resource "oci_network_load_balancer_backend_set" "k3s_nlb_backend_set" {
  network_load_balancer_id = oci_network_load_balancer_network_load_balancer.k3s_free_nlb.id
  name                     = "k3s-master-backend-set"
  policy                   = "FIVE_TUPLE"
  health_checker {
    protocol = "TCP"
    port     = 80
  }
}

resource "oci_network_load_balancer_backend" "k3s_master_backend" {
  network_load_balancer_id = oci_network_load_balancer_network_load_balancer.k3s_free_nlb.id
  backend_set_name         = oci_network_load_balancer_backend_set.k3s_nlb_backend_set.name
  port                     = 80
  target_id                = oci_core_instance.k3s_master.id
}

resource "oci_network_load_balancer_listener" "k3s_nlb_listener" {
  network_load_balancer_id = oci_network_load_balancer_network_load_balancer.k3s_free_nlb.id
  name                     = "http-listener"
  port                     = 80
  protocol                 = "TCP"
  default_backend_set_name = oci_network_load_balancer_backend_set.k3s_nlb_backend_set.name
}

resource "oci_network_load_balancer_backend_set" "k3s_nlb_https_backend_set" {
  network_load_balancer_id = oci_network_load_balancer_network_load_balancer.k3s_free_nlb.id
  name                     = "k3s-master-https-backend-set"
  policy                   = "FIVE_TUPLE"
  health_checker {
    protocol = "TCP"
    port     = 443
  }
}

resource "oci_network_load_balancer_backend" "k3s_master_https_backend" {
  network_load_balancer_id = oci_network_load_balancer_network_load_balancer.k3s_free_nlb.id
  backend_set_name         = oci_network_load_balancer_backend_set.k3s_nlb_https_backend_set.name
  port                     = 443
  target_id                = oci_core_instance.k3s_master.id
}

resource "oci_network_load_balancer_listener" "k3s_nlb_https_listener" {
  network_load_balancer_id = oci_network_load_balancer_network_load_balancer.k3s_free_nlb.id
  name                     = "https-listener"
  port                     = 443
  protocol                 = "TCP"
  default_backend_set_name = oci_network_load_balancer_backend_set.k3s_nlb_https_backend_set.name
}

data "oci_identity_availability_domains" "ads" {
  compartment_id = var.tenancy_ocid
}

data "oci_core_images" "ubuntu_arm64" {
  compartment_id           = var.tenancy_ocid
  operating_system         = "Canonical Ubuntu"
  operating_system_version = "22.04"
  shape                    = "VM.Standard.A1.Flex"
}

data "oci_core_images" "ubuntu_amd64" {
  compartment_id           = var.tenancy_ocid
  operating_system         = "Canonical Ubuntu"
  operating_system_version = "22.04"
  shape                    = "VM.Standard.E2.1.Micro"
}
