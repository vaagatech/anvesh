# Search Engine UI Hosting Infrastructure (AWS S3 + CloudFront + ACM)

# Random suffix for unique S3 bucket naming
resource "random_string" "s3_bucket_suffix" {
  length  = 6
  special = false
  upper   = false
}

# S3 Bucket for Search Engine UI static assets
resource "aws_s3_bucket" "search_ui" {
  bucket = "search-ui-${replace(var.domain_name, ".", "-")}-${random_string.s3_bucket_suffix.result}"

  tags = {
    Name        = "Search UI Bucket"
    Environment = "Production"
    Project     = "Anvesh-SearchEngine"
    ManagedBy   = "Terraform"
  }
}

# Block all public access to S3 bucket (served exclusively via CloudFront OAC)
resource "aws_s3_bucket_public_access_block" "search_ui_pab" {
  bucket = aws_s3_bucket.search_ui.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# CloudFront Origin Access Control (OAC) for secure S3 origin access
resource "aws_cloudfront_origin_access_control" "search_ui_oac" {
  name                              = "search-ui-s3-oac-${random_string.s3_bucket_suffix.result}"
  description                       = "Origin Access Control for Search Engine UI S3 Bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# S3 Bucket Policy allowing CloudFront OAC to read objects
resource "aws_s3_bucket_policy" "search_ui_policy" {
  bucket = aws_s3_bucket.search_ui.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontServicePrincipalReadOnly"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.search_ui.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.search_ui.arn
          }
        }
      }
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.search_ui_pab]
}

# ACM SSL Certificate in us-east-1 (required for CloudFront custom domain)
resource "aws_acm_certificate" "search_ui_cert" {
  domain_name       = "${var.search_ui_subdomain}.${var.domain_name}"
  validation_method = "DNS"

  tags = {
    Name        = "Search UI Certificate"
    Environment = "Production"
    ManagedBy   = "Terraform"
  }

  lifecycle {
    create_before_destroy = true
  }
}

# Wait for ACM Certificate Validation completion
resource "aws_acm_certificate_validation" "search_ui_cert_validation" {
  certificate_arn = aws_acm_certificate.search_ui_cert.arn
}

# CloudFront Distribution for Search Engine UI
resource "aws_cloudfront_distribution" "search_ui" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "Search Engine UI distribution (search.${var.domain_name})"
  default_root_object = "index.html"
  aliases             = ["${var.search_ui_subdomain}.${var.domain_name}"]

  origin {
    domain_name              = aws_s3_bucket.search_ui.bucket_regional_domain_name
    origin_id                = "S3-${aws_s3_bucket.search_ui.id}"
    origin_access_control_id = aws_cloudfront_origin_access_control.search_ui_oac.id
  }

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-${aws_s3_bucket.search_ui.id}"

    # AWS Managed CachingOptimized Cache Policy
    cache_policy_id        = "658327ea-f89d-4fab-a63d-7e88639e58f6"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
  }

  # SPA Routing Error Handling (redirect 403/404 to /index.html)
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.search_ui_cert_validation.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = {
    Environment = "Production"
    Project     = "Anvesh-SearchEngine"
    ManagedBy   = "Terraform"
  }
}
