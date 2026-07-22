import { useRef, type ChangeEvent } from "react";
import { ImagePlus, Trash2, Upload } from "lucide-react";

import type { WorkbenchAsset } from "../store/workbench-store";
import { Button, EmptyState, IconButton } from "./ui";

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function AssetLibrary({
  assets,
  loading,
  title = "参考素材",
  allowUpload = true,
  emptyTitle = "还没有参考图",
  emptyDescription = "上传主视图、细节、包装或使用场景；图片只保存在当前浏览器。",
  onUpload,
  onRemove,
}: {
  assets: WorkbenchAsset[];
  loading: boolean;
  title?: string;
  allowUpload?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onUpload: (files: File[]) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const chooseFiles = () => inputRef.current?.click();
  const changeFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length > 0) await onUpload(files);
  };

  return (
    <section className="asset-library" aria-label={title}>
      <div className="asset-library__header">
        <div>
          <strong>{title}</strong>
          <span>{assets.length} 张本地图片</span>
        </div>
        {allowUpload ? (
          <>
            <Button variant="secondary" onClick={chooseFiles} disabled={loading}>
              <Upload size={15} />
              {loading ? "处理中" : "上传图片"}
            </Button>
            <input
              ref={inputRef}
              className="visually-hidden-input"
              type="file"
              accept="image/*"
              multiple
              onChange={changeFiles}
              data-testid="asset-library-upload"
            />
          </>
        ) : null}
      </div>

      {assets.length === 0 ? (
        <EmptyState
          variant="asset"
          eyebrow="商品外观依据"
          icon={<ImagePlus size={23} />}
          title={emptyTitle}
          description={emptyDescription}
          action={
            allowUpload ? (
              <Button variant="secondary" onClick={chooseFiles} disabled={loading}>
                <Upload size={15} />
                选择图片
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="asset-grid">
          {assets.map((asset) => (
            <article className="asset-card" key={asset.metadata.id}>
              <div className="asset-card__media">
                <img src={asset.objectUrl} alt={asset.metadata.name} />
                {asset.metadata.kind === "reference" ? (
                  <IconButton
                    label={`删除素材 ${asset.metadata.name}`}
                    className="asset-card__delete"
                    onClick={() => void onRemove(asset.metadata.id)}
                    disabled={loading}
                  >
                    <Trash2 size={15} />
                  </IconButton>
                ) : null}
              </div>
              <div className="asset-card__meta">
                <strong title={asset.metadata.name}>{asset.metadata.name}</strong>
                <span>{formatBytes(asset.metadata.size)}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
