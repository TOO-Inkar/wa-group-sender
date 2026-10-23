FROM golang:1.26-bookworm AS build
ENV GOTOOLCHAIN=auto CGO_ENABLED=1
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY main.go ./
RUN --mount=type=cache,target=/root/.cache/go-build \
    go vet ./... && go build -trimpath -ldflags="-s -w" -o /out/wa-bridge .

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates tzdata \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -g 10002 bridge \
    && useradd -u 10002 -g bridge -M -d /data -s /usr/sbin/nologin bridge \
    && mkdir -p /data && chown bridge:bridge /data
COPY --from=build /out/wa-bridge /usr/local/bin/wa-bridge
ENV TZ=Asia/Almaty BRIDGE_ADDR=:8081 BRIDGE_DB=/data/bridge.db
USER bridge
VOLUME ["/data"]
EXPOSE 8081
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["/usr/local/bin/wa-bridge", "-healthcheck"]
ENTRYPOINT ["/usr/local/bin/wa-bridge"]
