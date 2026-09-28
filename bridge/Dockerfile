FROM golang:1.26-bookworm AS build
# Версия whatsmeow — коммит из go.mau.fi/whatsmeow; зависимости разрешаются от него при сборке.
ARG WHATSMEOW_REF=d9538eeba3acffa047f794a99e1b42bc111e2aee
ENV GOTOOLCHAIN=auto CGO_ENABLED=1
WORKDIR /src
COPY go.mod main.go ./
RUN go get go.mau.fi/whatsmeow@${WHATSMEOW_REF} \
    && go mod tidy \
    && go vet ./... \
    && go build -trimpath -ldflags="-s -w" -o /out/wa-bridge .

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
