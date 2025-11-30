export default function EyeIcon({ open }: { open: boolean }) {
  return (
    <img
      src={open ? "/eye-open.svg" : "/eye.svg"}
      className="w-5 h-5 opacity-70 hover:opacity-100 transition"
      alt="eye"
    />
  );
}
