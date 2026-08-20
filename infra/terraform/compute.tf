resource "oci_core_instance" "k3s_master" {
  # FIXED: Added [0] index to resolve multi-domain structures correctly
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[0].name
  compartment_id      = var.tenancy_ocid
  display_name        = "k3s-master-arm"
  shape               = "VM.Standard.A1.Flex"

  create_vnic_details {
    subnet_id        = oci_core_subnet.k3s_subnet.id
    assign_public_ip = true
    display_name     = "k3s-master-vnic"
  }

  source_details {
    source_type = "image"
    # FIXED: Added .images[0].id for robust image query matching
    source_id               = data.oci_core_images.ubuntu_arm64.images[0].id
    boot_volume_size_in_gbs = 50
  }

  shape_config {
    ocpus         = 1
    memory_in_gbs = 6
  }

  metadata = {
    ssh_authorized_keys = var.ssh_public_key
    # FIXED: Reconstructed clear bash string payload blocks
    user_data = base64encode(<<-EOF
      #!/bin/bash
      sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
      sudo chmod 600 /swapfile
      sudo mkswap /swapfile
      sudo swapon /swapfile
      echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
      sudo iptables -F
      sudo iptables-save | sudo tee /etc/iptables/rules.v4
      curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="server --write-kubeconfig-mode 644 --tls-san $(curl -s https://ifconfig.me)" sh -
      until [ -f /var/lib/rancher/k3s/server/node-token ]; do sleep 2; done
      TOKEN=$(cat /var/lib/rancher/k3s/server/node-token)
      echo -e "HTTP/1.1 200 OK\r\nContent-Length: $${#TOKEN}\r\n\r\n$${TOKEN}" > /tmp/token_response
      while true; do nc -l -p 8000 < /tmp/token_response; done &
    EOF
    )
  }

  lifecycle {
    ignore_changes = [metadata]
  }
}
