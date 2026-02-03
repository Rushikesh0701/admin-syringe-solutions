#!/bin/bash

# ========== CONFIG ==========
DEFAULT_PROFILE="default"
DEFAULT_REGION="us-east-1"
ACCOUNT_ID="168895053043" 
REPO_NAME="syringe_solution_admin"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== InFlow Sync Deployment Helper ===${NC}"

# Ask for AWS Profile
read -p "Enter AWS Profile [${DEFAULT_PROFILE}]: " AWS_PROFILE
AWS_PROFILE=${AWS_PROFILE:-$DEFAULT_PROFILE}

# Ask for AWS Region
read -p "Enter AWS Region [${DEFAULT_REGION}]: " AWS_REGION
AWS_REGION=${AWS_REGION:-$DEFAULT_REGION}

echo -e "${GREEN}Using Profile: $AWS_PROFILE | Region: $AWS_REGION${NC}"

# ECR Registry URL
ECR_REGISTRY="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
ECR_URL="$ECR_REGISTRY/$REPO_NAME"

# Get Git commit (short) for versioning
VERSION=$(git rev-parse --short HEAD 2>/dev/null || echo "latest")

login_ecr() {
    echo -e "\n${BLUE}Logging into ECR...${NC}"
    aws ecr get-login-password --region "$AWS_REGION" --profile "$AWS_PROFILE" | docker login --username AWS --password-stdin "$ECR_REGISTRY"
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}Login Succeeded!${NC}"
    else
        echo -e "${RED}Login Failed! Please check your credentials.${NC}"
        return 1
    fi
}

build_push_frontend() {
    echo -e "\n${BLUE}Building Frontend...${NC}"
    docker build --platform linux/amd64 -t inflow-frontend ./frontend
    if [ $? -ne 0 ]; then echo -e "${RED}Frontend Build Failed!${NC}"; return 1; fi

    echo -e "${BLUE}Tagging Frontend...${NC}"
    docker tag inflow-frontend:latest "$ECR_URL:frontend-latest"
    docker tag inflow-frontend:latest "$ECR_URL:frontend-$VERSION"

    echo -e "${BLUE}Pushing Frontend...${NC}"
    docker push "$ECR_URL:frontend-latest"
    docker push "$ECR_URL:frontend-$VERSION"
    if [ $? -eq 0 ]; then echo -e "${GREEN}Frontend Pushed Successfully!${NC}"; else echo -e "${RED}Frontend Push Failed!${NC}"; fi
}

build_push_backend() {
    echo -e "\n${BLUE}Building Backend...${NC}"
    docker build --platform linux/amd64 -t inflow-backend ./backend
    if [ $? -ne 0 ]; then echo -e "${RED}Backend Build Failed!${NC}"; return 1; fi

    echo -e "${BLUE}Tagging Backend...${NC}"
    docker tag inflow-backend:latest "$ECR_URL:backend-latest"
    docker tag inflow-backend:latest "$ECR_URL:backend-$VERSION"

    echo -e "${BLUE}Pushing Backend...${NC}"
    docker push "$ECR_URL:backend-latest"
    docker push "$ECR_URL:backend-$VERSION"
    if [ $? -eq 0 ]; then echo -e "${GREEN}Backend Pushed Successfully!${NC}"; else echo -e "${RED}Backend Push Failed!${NC}"; fi
}

while true; do
    echo -e "\n${BLUE}--- Main Menu ---${NC}"
    echo "1) Login to ECR"
    echo "2) Build & Push Frontend"
    echo "3) Build & Push Backend"
    echo "4) Build & Push Both (Frontend & Backend)"
    echo "5) Exit"
    read -p "Select an option [1-5]: " option

    case $option in
        1)
            login_ecr
            ;;
        2)
            build_push_frontend
            ;;
        3)
            build_push_backend
            ;;
        4)
            build_push_frontend
            build_push_backend
            ;;
        5)
            echo "Exiting..."
            exit 0
            ;;
        *)
            echo -e "${RED}Invalid option. Please try again.${NC}"
            ;;
    esac
done