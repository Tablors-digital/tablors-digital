import { PotsPinForm } from "./pots-pin-form";

export const dynamic = "force-dynamic";

export default function PotsPinPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black p-4">
      <PotsPinForm />
    </div>
  );
}