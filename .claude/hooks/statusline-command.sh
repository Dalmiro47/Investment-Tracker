#!/usr/bin/env bash
# Claude Code status line script

input=$(cat)

# --- User & Git branch ---
user=$(whoami)
branch=$(git -C "$(echo "$input" | jq -r '.workspace.current_dir')" --no-optional-locks rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")

# --- Context window ---
used_pct=$(echo "$input" | jq -r '.context_window.used_percentage // empty')
ctx_window=$(echo "$input" | jq -r '.context_window.context_window_size // empty')
input_tokens=$(echo "$input" | jq -r '.context_window.current_usage.input_tokens // empty')
cache_read=$(echo "$input" | jq -r '.context_window.current_usage.cache_read_input_tokens // 0')
cache_create=$(echo "$input" | jq -r '.context_window.current_usage.cache_creation_input_tokens // 0')
output_tokens=$(echo "$input" | jq -r '.context_window.current_usage.output_tokens // empty')

# --- USD cost estimate (claude-sonnet-4 pricing per million tokens) ---
# Input: $3.00/M, Cache write: $3.75/M, Cache read: $0.30/M, Output: $15.00/M
cost_usd=""
if [ -n "$input_tokens" ] && [ -n "$output_tokens" ]; then
  cost_usd=$(echo "$input_tokens $cache_read $cache_create $output_tokens" | awk '{
    input=$1; cr=$2; cw=$3; out=$4
    cost = (input/1000000*3.00) + (cw/1000000*3.75) + (cr/1000000*0.30) + (out/1000000*15.00)
    printf "$%.4f", cost
  }')
fi

# --- Rate limits ---
five_pct=$(echo "$input" | jq -r '.rate_limits.five_hour.used_percentage // empty')
week_pct=$(echo "$input" | jq -r '.rate_limits.seven_day.used_percentage // empty')

# --- Build output ---
# Colors (ANSI — terminal will dim them)
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
MAGENTA='\033[0;35m'
RED='\033[0;31m'
RESET='\033[0m'

parts=()

# User
parts+=("$(printf "${CYAN}%s${RESET}" "$user")")

# Branch
if [ -n "$branch" ]; then
  parts+=("$(printf "${GREEN}%s${RESET}" "$branch")")
fi

# Context used %
if [ -n "$used_pct" ]; then
  ctx_str=$(printf "ctx:%.0f%%" "$used_pct")
  parts+=("$(printf "${YELLOW}%s${RESET}" "$ctx_str")")
fi

# Cost USD
if [ -n "$cost_usd" ]; then
  parts+=("$(printf "${MAGENTA}%s${RESET}" "$cost_usd")")
fi

# Rate limits
rate_parts=()
if [ -n "$five_pct" ]; then
  rate_parts+=("$(printf "5h:%.0f%%" "$five_pct")")
fi
if [ -n "$week_pct" ]; then
  rate_parts+=("$(printf "7d:%.0f%%" "$week_pct")")
fi
if [ ${#rate_parts[@]} -gt 0 ]; then
  combined=$(IFS=' '; echo "${rate_parts[*]}")
  parts+=("$(printf "${RED}%s${RESET}" "$combined")")
fi

# Join with separator
(IFS='|'; printf '%b' "${parts[*]}")
