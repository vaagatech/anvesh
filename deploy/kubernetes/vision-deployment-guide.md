# Multi-Modal Vision Microservice (`anvesh-vision`) Deployment Guide

This guide details how to deploy and configure the optional **Anvesh Multi-Modal Vision Microservice** (`@vaagatech/anvesh-vision`) on Kubernetes (OCI OKE / K3s / EKS / GKE).

> [!NOTE]
> **Zero-Bloat Guarantee**: Anvesh Engine and Indexer work out-of-the-box using the built-in pure-CPU visual extractor (`@vaagatech/anvesh-visual-extractor`). You only need to deploy `anvesh-vision` if you want AI zero-shot image embedding.

---

## 1. Model Sizing & Resource Requirements

Anvesh Vision supports two deployment profiles:

| Specification | Profile A: MobileCLIP (Default) | Profile B: OpenCLIP (ViT-B/32) |
| :--- | :--- | :--- |
| **Model Format** | INT8 Quantized ONNX | Float32 / FP16 ViT-B/32 |
| **Model Size** | **~80 MB – 140 MB** | **~350 MB** |
| **Pod RAM Request** | **192 MiB** | **512 MiB** |
| **Pod RAM Limit** | **384 MiB** | **1 GiB** |
| **Pod CPU Request** | **100m** | **200m** |
| **Embedding Dims** | **512 dimensions** | **512 dimensions** |
| **Query Latency** | **< 15 ms (CPU)** | **< 30 ms (CPU)** |
| **Recommended Use** | Lightweight K3s, OCI Free Tier, standard retail catalogues | Heavy multimodal workloads with GPU nodes |

---

## 2. Kubernetes Manifest Example

The manifest is located at [`infra/k8s/anvesh-vision-example.yaml`](file:///Users/karthiksp/projects/searchengine/infra/k8s/anvesh-vision-example.yaml).

### How to Apply (When Resources are Ready):
```bash
# 1. Build and push the container image (or use official ghcr.io image)
docker build -f apps/vision/Dockerfile -t ghcr.io/vaagatech/anvesh-vision:0.4.0 .
docker push ghcr.io/vaagatech/anvesh-vision:0.4.0

# 2. Deploy to the 'anvesh' namespace
kubectl apply -f infra/k8s/anvesh-vision-example.yaml
```

---

## 3. Dynamic Service Discovery & Auto-Registration

Once `anvesh-vision` is running in your cluster, the **Indexer** and **Engine** automatically discover it:

1. **Service URL**: `http://anvesh-vision.anvesh.svc.cluster.local:3853`
2. **Environment Variable** (already defaults in cluster):
   ```yaml
   ANVESH_VISION_URL: "http://anvesh-vision.anvesh.svc.cluster.local:3853"
   ```
3. **Behavior**:
   - **Indexer**: When a document contains images (`imageUrl`, `thumbnail`), it calls `POST /v1/embed/image` and attaches `image_vector: number[512]`.
   - **Engine**: When a multi-modal search query comes in, it calls `POST /v1/embed/text` to perform cosine similarity over `image_vector`.
   - **Fallback**: If `anvesh-vision` pod is scaled to `0` or stopped, Indexer automatically falls back to local textile color + motif analysis without throwing errors.

---

## 4. Scaling & Decommissioning

If you ever need to free up memory on your cluster:
```bash
# Scale down to 0 pods (Engine will seamlessly fall back to non-AI visual extraction)
kubectl scale deployment anvesh-vision -n anvesh --replicas=0

# Scale back up when resources are available
kubectl scale deployment anvesh-vision -n anvesh --replicas=1
```
