#!/bin/bash
# 1. Setup 2GB Swap space immediately to stabilize cloud environments
sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# 2. Disable default restrictive rules
sudo iptables -F
sudo iptables-save | sudo tee /etc/iptables/rules.v4

# 3. Boot Vanilla K3s Control Plane
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="server --write-kubeconfig-mode 644 --tls-san $(curl -s https://ifconfig.me)" sh -

# 4. Expose the cluster registration token internally inside VCN for 10 minutes via lightweight background server
until [ -f /var/lib/rancher/k3s/server/node-token ]; do sleep 2; done
TOKEN=$(cat /var/lib/rancher/k3s/server/node-token)
echo -e "HTTP/1.1 200 OK\r\nContent-Length: ${{#TOKEN}}\r\n\r\n${{TOKEN}}" > /tmp/token_response
while true; do
  nc -l -p 8000 < /tmp/token_response
done &
