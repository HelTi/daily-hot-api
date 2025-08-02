# 配置变量
IMAGE_NAME ?= daily-hot-api
IMAGE_TAG ?= latest
DOCKER_REGISTRY ?= ttkit

.PHONY: build
build:
	docker compose build

.PHONY: up
up:
	docker compose up -d

.PHONY: down
down:
	docker compose down

.PHONY: restart
restart:
	docker compose down
	docker compose up -d

.PHONY: logs
logs:
	docker compose logs -f

.PHONY: clean
clean:
	docker compose down
	docker system prune -f

.PHONY: tag
tag:
	docker tag $(IMAGE_NAME):$(IMAGE_TAG) $(DOCKER_REGISTRY)/$(IMAGE_NAME):$(IMAGE_TAG)

.PHONY: push
push: tag
	docker push $(DOCKER_REGISTRY)/$(IMAGE_NAME):$(IMAGE_TAG)

.PHONY: login
login:
	docker login $(DOCKER_REGISTRY)

.PHONY: deploy
deploy: build up
