#!/bin/bash
# 1. Setup Swap space immediately (mandatory for 1GB RAM AMD Micro nodes)
sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# 2. Open up OS Firewalls
sudo iptables -F
sudo iptables-save | sudo tee /etc/iptables/rules.v4

# 3. Pull token safely from the master node over private subnet
echo "Fetching registration token from K3s master at ${master_ip}..."
until K3S_TOKEN=$(curl -sS --fail http://${master_ip}:8000/); do
  sleep 5
done

# 4. Install K3s Agent and auto-join the multi-arch cluster
curl -sfL https://get.k3s.io | K3S_URL=https://${master_ip}:6443 K3S_TOKEN=$K3S_TOKEN sh -
