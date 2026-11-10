import { Link } from "react-router";
import { EmptyState } from "@/components/tables/table";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <EmptyState
      title="Page not found"
      hint="This address is not part of the console."
      action={
        <Button asChild variant="secondary">
          <Link to="/">Back to the overview</Link>
        </Button>
      }
    />
  );
}
