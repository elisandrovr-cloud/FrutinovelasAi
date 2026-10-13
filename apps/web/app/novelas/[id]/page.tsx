import { NovelaWorkspace } from "@/components/novela/workspace";

export default function NovelaPage({ params }: { params: { id: string } }) {
  return <NovelaWorkspace id={params.id} />;
}
