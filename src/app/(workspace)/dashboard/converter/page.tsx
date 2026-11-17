import { PageHeading } from "@/components/page-heading";
import { ConverterWorkspace } from "@/components/converter/workspace";
export const metadata = { title: "Data converter" };
export default function Converter() {
  return (
    <>
      <PageHeading
        eyebrow="Migration / Review before transfer"
        title="Bring your information forward."
        description="Convert XLSX and CSV exports into reviewed, consistent records. Choose the template that fits the information; original files stay unchanged."
      />
      <ConverterWorkspace />
    </>
  );
}
