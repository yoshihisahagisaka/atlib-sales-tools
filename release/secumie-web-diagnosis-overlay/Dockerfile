# Only the four approved diagnosis files enter the final image.
ARG BASE_IMAGE
FROM ${BASE_IMAGE} AS baseline
FROM baseline AS verify
COPY manifest.json verify.cjs /tmp/wsc-release/
COPY test/ /tmp/wsc-release/test/
USER nonroot
RUN ["/nodejs/bin/node","/tmp/wsc-release/verify.cjs","before"]
COPY src/wsc/vendor/tools/wsc-phase2c/restricted-network-probe.mjs /app/dist/wsc/vendor/tools/wsc-phase2c/restricted-network-probe.mjs
COPY src/wsc/vendor/tools/wsc-vs1/engine.mjs /app/dist/wsc/vendor/tools/wsc-vs1/engine.mjs
COPY src/wsc/vendor/tools/wsc-vs1/explanations.json /app/dist/wsc/vendor/tools/wsc-vs1/explanations.json
COPY src/wsc/vendor/tools/wsc-vs1/rules.json /app/dist/wsc/vendor/tools/wsc-vs1/rules.json
RUN ["/nodejs/bin/node","/tmp/wsc-release/verify.cjs","after"]

FROM baseline AS runtime
ARG BASE_IMAGE
ARG SOURCE_REVISION
LABEL org.opencontainers.image.revision=$SOURCE_REVISION com.atlib.overlay.base=$BASE_IMAGE
COPY --from=verify /app/dist/wsc/vendor/tools/wsc-phase2c/restricted-network-probe.mjs /app/dist/wsc/vendor/tools/wsc-phase2c/restricted-network-probe.mjs
COPY --from=verify /app/dist/wsc/vendor/tools/wsc-vs1/engine.mjs /app/dist/wsc/vendor/tools/wsc-vs1/engine.mjs
COPY --from=verify /app/dist/wsc/vendor/tools/wsc-vs1/explanations.json /app/dist/wsc/vendor/tools/wsc-vs1/explanations.json
COPY --from=verify /app/dist/wsc/vendor/tools/wsc-vs1/rules.json /app/dist/wsc/vendor/tools/wsc-vs1/rules.json
USER nonroot
RUN ["/nodejs/bin/node","--check","/app/dist/wsc/vendor/tools/wsc-phase2c/restricted-network-probe.mjs"]
RUN ["/nodejs/bin/node","--check","/app/dist/wsc/vendor/tools/wsc-vs1/engine.mjs"]
