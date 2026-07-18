# Amazon ECS / Fargate

Run the **same Anvesh container image** behind an Application Load Balancer. No Lambda required.

## Steps

1. Build and push the image to ECR.
2. Create Secrets Manager secret for `ANVESH_API_KEY`.
3. Create CloudWatch log group `/ecs/anvesh`.
4. Edit [`task-definition.json`](./task-definition.json) — replace `ACCOUNT_ID`, `REGION`, image URI, Redis/S3 settings, and IAM role ARNs.
5. Register the task definition and create a service from [`service.json`](./service.json) (or the AWS Console / CDK / Terraform).

```bash
aws ecr create-repository --repository-name anvesh
docker build -t anvesh:0.1.0 .
docker tag anvesh:0.1.0 ACCOUNT_ID.dkr.ecr.REGION.amazonaws.com/anvesh:0.1.0
aws ecr get-login-password --region REGION | docker login --username AWS --password-stdin ACCOUNT_ID.dkr.ecr.REGION.amazonaws.com
docker push ACCOUNT_ID.dkr.ecr.REGION.amazonaws.com/anvesh:0.1.0

aws ecs register-task-definition --cli-input-json file://deploy/ecs/task-definition.json
aws ecs create-service --cli-input-json file://deploy/ecs/service.json
```

## ALB target group

- Protocol: HTTP
- Port: 3848
- Health check path: `/health` (or `/ready` for stricter checks)
- Success codes: 200

## Task IAM

Grant the **task role** (not only execution role) access to your storage:

- ElastiCache / Redis security group ingress from the ECS tasks SG
- or `s3:GetObject` / `PutObject` / `DeleteObject` / `ListBucket` on the index prefix
- or DynamoDB item CRUD on the indexes table

## Multi-replica

Keep `desiredCount >= 2` only with shared storage (`redis`, `s3`, `dynamodb`, `mongodb`). Do not use `filesystem` with multiple tasks unless each task has its own EFS with exclusive access patterns you fully control.
