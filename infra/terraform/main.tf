// Managed Postgres (Neon) and Redis (Upstash), both on free tiers. Fly.io hosts the two apps and is
// driven by fly.toml / fly.worker.toml and scripts/deploy.sh rather than Terraform, because the official
// Fly provider is no longer maintained.
terraform {
  required_version = ">= 1.6"
  required_providers {
    neon = {
      source  = "kislerdm/neon"
      version = "~> 0.9"
    }
    upstash = {
      source  = "upstash/upstash"
      version = "~> 1.5"
    }
  }
}

provider "neon" {
  api_key = var.neon_api_key
}

provider "upstash" {
  email   = var.upstash_email
  api_key = var.upstash_api_key
}

resource "neon_project" "this" {
  name                      = var.name
  region_id                 = var.neon_region
  pg_version                = 16
  history_retention_seconds = 86400
}

resource "upstash_redis_database" "this" {
  database_name  = var.name
  region         = "global"
  primary_region = var.upstash_region
  tls            = true
  eviction       = false
}
