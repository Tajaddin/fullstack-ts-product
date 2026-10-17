variable "name" {
  description = "Project name used for the Neon project and the Upstash database"
  type        = string
  default     = "coursemates"
}

variable "neon_api_key" {
  description = "Neon API key (console.neon.tech, Account settings, API keys)"
  type        = string
  sensitive   = true
}

variable "neon_region" {
  description = "Neon region id"
  type        = string
  default     = "aws-us-east-1"
}

variable "upstash_email" {
  description = "Upstash account e-mail"
  type        = string
}

variable "upstash_api_key" {
  description = "Upstash management API key (console.upstash.com, Account, Management API)"
  type        = string
  sensitive   = true
}

variable "upstash_region" {
  description = "Primary region of the global Redis database"
  type        = string
  default     = "us-east-1"
}
