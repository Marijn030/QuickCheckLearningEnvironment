FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ghc libghc-quickcheck2-dev ca-certificates \
 && rm -rf /var/lib/apt/lists/*
USER 65534:65534
WORKDIR /tmp
