# SubQuery Governance

SubQuery indexer for OpenGov referenda, votes and delegations across Substrate networks.
Network manifests live in the repository root; Asset Hub manifests are
`polkadot-ah.yaml`, `kusama-ah.yaml` and `westend-ah.yaml`.

## Development

Use the Node version defined in [versions.env](versions.env). Corepack selects the Yarn
version pinned in `package.json`; the SubQuery CLI is installed with the project dependencies.
Local indexing also requires Docker and `docker-compose`.

Run from the repository root:

```bash
corepack enable
yarn install --immutable
yarn codegen
yarn build
```

The schema is in [schema.graphql](schema.graphql), handlers are in `src/mappings`, and
network-specific decoding overrides are in `chainTypes`. `yarn codegen` generates models
under `src/types`; `yarn build` writes the mapping and chaintypes bundles to `dist`.

## Indexing and Query

#### Run required systems in docker

After generating types and building the project, select a network and start the local stack:

```bash
export PROJECT_PATH=polkadot-ah.yaml
yarn start:docker
```

The scripts pass `--env-file versions.env` to Compose. For direct Compose commands,
use the same option:

```bash
docker-compose --env-file versions.env up --remove-orphans
```

`bash local-runner.sh polkadot-ah.yaml` installs dependencies, builds and starts the stack.
It preserves `.data/postgres` and the indexer's existing checkpoint. When selecting a
different network, use a separate `DB_SCHEMA`, for example
`DB_SCHEMA=kusama_ah bash local-runner.sh kusama-ah.yaml`; both the indexer and query
service use that schema. The default remains `app` for existing local databases.

### Runtime Images

[versions.env](versions.env) supplies image defaults to Compose and both CI workflows.
`NODE_IMAGE` selects build tooling, `SUBQL_NODE_IMAGE` the local indexer runtime, and
`SUBQL_PRODUCTION_IMAGE` the production base image. All runtime defaults derive from
`SUBQL_NODE_VERSION`; existing environment overrides take precedence.

Build a production image from the repository root:

```bash
source versions.env
docker build -f docker/subql-node-Dockerfile \
  --build-arg NODE_IMAGE="$NODE_IMAGE" \
  --build-arg SUBQL_NODE_IMAGE="$SUBQL_PRODUCTION_IMAGE" \
  -t subquery-governance:local .
```

These build arguments are required. `.dockerignore` excludes local databases, VCS data,
caches and generated files; dependencies, models and bundles are rebuilt inside the image.
The Docker workflow supports `workflow_dispatch` to build and publish a selected branch
before merging. Automatic publication remains enabled for `master`, `dev` and version tags.

### Asset Hub v5 Recovery

The shared decoder in [chainTypes/assetHubExtrinsic.ts](chainTypes/assetHubExtrinsic.ts)
reads General-v5 transaction extensions from runtime metadata and is registered for all
three Asset Hubs. It exposes signed origins while preserving encoded bytes and hashes;
v4 and bare-v5 extrinsics use the standard codec. The implementation follows
[accounts PR #97](https://github.com/novasamatech/subquery-accounts/pull/97).

For the Polkadot Asset Hub failure at block `20494727` (`Invalid data passed to Mortal era`),
deploy an image containing the rebuilt chaintypes and resume the existing checkpoint.
Fetching failed before indexing this block, so recovery does not require skipping it or
clearing the database. A dictionary HTTP 503 is a separate endpoint failure. Updating
project dependencies alone does not change the decoder bundled in the runtime image.

#### Query the project

Open your browser and head to `http://localhost:3000`.

Finally, you should see a GraphQL playground is showing in the explorer and the schemas that ready to query.

For example, query indexed delegates:

```graphql
{
  query {
    delegates(first: 10) {
      nodes {
        id
        accountId
        delegators
        delegatorVotes
      }
    }
  }
}
```
## License
Subquery governance is available under MIT license. See the LICENSE file for more info.
© Novasama Technologies GmbH 2023
