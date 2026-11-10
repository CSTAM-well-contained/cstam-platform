import { useRoutes, useTeams } from "@/api/queries";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, Mono } from "@/components/status/status";
import { EmptyState, ErrorState, SkeletonRows, Table, Td, Th, Tr } from "@/components/tables/table";

export default function RoutesPage() {
  const { data, error, isPending } = useRoutes();
  const teams = useTeams().data ?? [];
  const routes = [...(data?.routes ?? [])].sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
  const teamOf = (host?: string) => teams.find((t) => t.fqdn === host);

  return (
    <>
      <PageHeader
        title="Routes"
        description={
          <>
            The routing table the gateways should serve now
            {data && (
              <>
                {" "}
                · generation <Mono>{data.generation}</Mono>
              </>
            )}
          </>
        }
      >
        {data?.force_backup?.map((g) => (
          <Badge key={g} tone="warn">
            {g} forced to backup
          </Badge>
        ))}
        {data?.config?.version && <Badge tone="info">config {data.config.version}</Badge>}
      </PageHeader>
      {error && !data ? (
        <ErrorState error={error} />
      ) : !isPending && !routes.length ? (
        <EmptyState title="No route" hint="A team gets a route when it is ready." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Host</Th>
              <Th>Slot</Th>
              <Th>Backend</Th>
              <Th>Team</Th>
            </tr>
          </thead>
          <tbody>
            {isPending ? (
              <SkeletonRows cols={4} />
            ) : (
              routes.map((r) => (
                <Tr key={r.host}>
                  <Td>
                    <Mono copy="host">{r.host}</Mono>
                  </Td>
                  <Td>
                    <Mono>{r.slot}</Mono>
                  </Td>
                  <Td>
                    <Mono copy="address">{`${r.addr}:${r.port}`}</Mono>
                  </Td>
                  <Td className="text-muted">{teamOf(r.host)?.name ?? "-"}</Td>
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      )}
    </>
  );
}
