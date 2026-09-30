type UploadFieldProps = {
  title: string;
  hint: string;
  accept: string;
  onFile: (file: File | null, input: HTMLInputElement) => void;
};

export function UploadField({ title, hint, accept, onFile }: UploadFieldProps) {
  return (
    <label className="upload">
      <input type="file" accept={accept} onChange={(e) => onFile(e.target.files?.[0] ?? null, e.target)} />
      <b>{title}</b>
      <small>{hint}</small>
    </label>
  );
}
