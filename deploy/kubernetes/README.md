# Kubernetes / EKS

Same container image as Docker Compose and ECS. Multi-replica requires shared storage (`redis`, `s3`, `dynamodb`, or `mongodb`).

## Apply

```bash
# 1. Build & push image to ECR (or any registry)
docker build -t <account>.dkr.ecr.<region>.amazonaws.com/anvesh:0.1.0 .
docker push <account>.dkr.ecr.<region>.amazonaws.com/anvesh:0.1.0

# 2. Edit anvesh.yaml — set image, host, REDIS_URL / S3 env
# 3. Apply
kubectl apply -f deploy/kubernetes/anvesh.yaml
kubectl -n anvesh rollout status deploy/anvesh
kubectl -n anvesh get svc,ingress
```

## EKS notes

- Use an **IAM role for service accounts (IRSA)** when `ANVESH_STORAGE=s3` or `dynamodb` instead of embedding keys.
- Prefer **Amazon ElastiCache** over the in-manifest Redis Deployment for production.
- ALB Ingress Controller: swap the Ingress annotations for `alb.ingress.kubernetes.io/*`.
- Horizontal scale: `kubectl -n anvesh scale deploy/anvesh --replicas=4` — safe when indexes live in Redis/S3/etc.

## Single-replica filesystem (PVC)

If you only need one pod and want local durability:

1. Set `ANVESH_STORAGE=filesystem` and `ANVESH_DATA_DIR=/data`
2. Mount a PersistentVolumeClaim at `/data`
3. Keep `replicas: 1` (filesystem is not shared across pods)
