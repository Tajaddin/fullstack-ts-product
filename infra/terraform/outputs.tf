output "database_url" {
  description = "Postgres connection string for DATABASE_URL (Fly secret)"
  value       = neon_project.this.connection_uri
  sensitive   = true
}

output "redis_url" {
  description = "Redis connection string for REDIS_URL (Fly secret)"
  value       = "rediss://default:${upstash_redis_database.this.password}@${upstash_redis_database.this.endpoint}:${upstash_redis_database.this.port}"
  sensitive   = true
}
