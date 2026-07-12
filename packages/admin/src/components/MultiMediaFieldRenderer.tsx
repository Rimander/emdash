/**
 * MultiMediaFieldRenderer — ordered list of media values for image/file
 * fields with `validation.multiple`.
 *
 * Items are added through the multi-select media picker and reordered via
 * drag-and-drop. The emitted value is a plain array of media values (same
 * per-item shape as the single ImageFieldRenderer / FileFieldRenderer).
 */

import { Button, Label } from "@cloudflare/kumo";
import { DndContext, closestCenter } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
	SortableContext,
	verticalListSortingStrategy,
	useSortable,
	arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { Plus, Trash, DotsSixVertical, ImageBroken } from "@phosphor-icons/react";
import * as React from "react";

import type { MediaItem } from "../lib/api";
import { getFileIcon } from "../lib/media-utils";
import { cn } from "../lib/utils";
import { mediaItemToImageValue, type ImageFieldValue } from "./ImageFieldRenderer";
import { MediaPickerModal } from "./MediaPickerModal";

/** Superset of the image and file value shapes, keyed by what each kind uses. */
export interface MultiMediaValue extends ImageFieldValue {
	filename?: string;
	mimeType?: string;
	size?: number;
}

/** Map a picked MediaItem to the stored file field value. */
export function mediaItemToFileValue(item: MediaItem): MultiMediaValue {
	const isLocalProvider = !item.provider || item.provider === "local";
	return {
		id: item.id,
		provider: item.provider || "local",
		src: isLocalProvider ? undefined : item.url,
		filename: item.filename,
		mimeType: item.mimeType,
		size: item.size,
		meta: isLocalProvider ? { ...item.meta, storageKey: item.storageKey } : item.meta,
	};
}

export interface MultiMediaFieldRendererProps {
	id?: string;
	label: string;
	kind: "image" | "file";
	value: unknown;
	onChange: (value: MultiMediaValue[]) => void;
	required?: boolean;
	allowedMimeTypes?: string[];
	fieldId?: string;
	minItems?: number;
	maxItems?: number;
}

type KeyedItem = { _key: string; value: MultiMediaValue };

function ensureKeys(items: unknown[]): KeyedItem[] {
	return items
		.filter((item): item is MultiMediaValue => typeof item === "object" && item !== null)
		.map((value, i) => ({ _key: `item-${i}-${Date.now()}`, value }));
}

export function MultiMediaFieldRenderer({
	id,
	label,
	kind,
	value,
	onChange,
	required,
	allowedMimeTypes,
	fieldId,
	minItems = 0,
	maxItems,
}: MultiMediaFieldRendererProps) {
	const { t } = useLingui();
	const [pickerOpen, setPickerOpen] = React.useState(false);
	// A single stored object (field toggled from single to multiple) is shown
	// as a one-item list; the server-side schema does the same wrapping.
	const rawItems = Array.isArray(value) ? value : value != null ? [value] : [];
	const [items, setItems] = React.useState<KeyedItem[]>(() => ensureKeys(rawItems));

	// Sync from external value changes, preserving keys by position so
	// round-trips through onChange don't remount rows.
	React.useEffect(() => {
		const incoming = Array.isArray(value) ? value : value != null ? [value] : [];
		setItems((prev) =>
			ensureKeys(incoming).map((item, i) => ({ ...item, _key: prev[i]?._key ?? item._key })),
		);
	}, [value]);

	const emitChange = (updated: KeyedItem[]) => {
		setItems(updated);
		onChange(updated.map((item) => item.value));
	};

	const handleAdd = (selected: MediaItem[]) => {
		const mapper = kind === "image" ? mediaItemToImageValue : mediaItemToFileValue;
		const added = selected.map((item, i) => ({
			_key: `item-${items.length + i}-${Date.now()}`,
			value: mapper(item),
		}));
		emitChange([...items, ...added]);
	};

	const handleRemove = (key: string) => {
		emitChange(items.filter((item) => item._key !== key));
	};

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;
		if (!over || active.id === over.id) return;
		const oldIndex = items.findIndex((item) => item._key === active.id);
		const newIndex = items.findIndex((item) => item._key === over.id);
		if (oldIndex === -1 || newIndex === -1) return;
		emitChange(arrayMove(items, oldIndex, newIndex));
	};

	const canAdd = !maxItems || items.length < maxItems;
	const canRemove = items.length > minItems;

	return (
		<div id={id}>
			<div className="flex items-center justify-between">
				<Label>
					{label}
					{items.length > 0 && (
						<span className="ms-2 text-kumo-subtle font-normal">
							{plural(items.length, { one: "(# item)", other: "(# items)" })}
						</span>
					)}
				</Label>
				{canAdd && (
					<Button variant="outline" size="sm" icon={<Plus />} onClick={() => setPickerOpen(true)}>
						{kind === "image" ? t`Add Images` : t`Add Files`}
					</Button>
				)}
			</div>

			{items.length === 0 ? (
				<Button
					type="button"
					variant="outline"
					className="mt-2 w-full h-24 justify-center border-dashed"
					onClick={() => setPickerOpen(true)}
				>
					<div className="flex flex-col items-center gap-1 text-kumo-subtle">
						<Plus className="h-6 w-6" />
						<span>{kind === "image" ? t`Select images` : t`Select files`}</span>
					</div>
				</Button>
			) : (
				<DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
					<SortableContext
						items={items.map((item) => item._key)}
						strategy={verticalListSortingStrategy}
					>
						<div className="mt-2 space-y-2">
							{items.map((item, index) => (
								<SortableMediaRow
									key={item._key}
									item={item.value}
									kind={kind}
									sortKey={item._key}
									index={index}
									onRemove={canRemove ? () => handleRemove(item._key) : undefined}
								/>
							))}
						</div>
					</SortableContext>
				</DndContext>
			)}

			<MediaPickerModal
				open={pickerOpen}
				onOpenChange={setPickerOpen}
				multiple
				onSelect={() => {}}
				onSelectMany={handleAdd}
				mimeTypeFilters={
					allowedMimeTypes && allowedMimeTypes.length > 0
						? allowedMimeTypes
						: kind === "image"
							? ["image/"]
							: []
				}
				fieldId={fieldId}
				hideUrlInput={kind === "file"}
				mediaKind={kind}
				title={t`Select ${label}`}
			/>
			{required && items.length === 0 && (
				<p className="text-sm text-kumo-danger mt-1">{t`This field is required`}</p>
			)}
		</div>
	);
}

interface SortableMediaRowProps {
	item: MultiMediaValue;
	kind: "image" | "file";
	sortKey: string;
	index: number;
	onRemove?: () => void;
}

function SortableMediaRow({ item, kind, sortKey, index, onRemove }: SortableMediaRowProps) {
	const { t } = useLingui();
	const [imageBroken, setImageBroken] = React.useState(false);
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: sortKey,
	});

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	const isLocal = !item.provider || item.provider === "local";
	const storageKey = typeof item.meta?.storageKey === "string" ? item.meta.storageKey : undefined;
	const displayUrl =
		item.previewUrl ||
		item.src ||
		(isLocal ? `/_emdash/api/media/file/${encodeURIComponent(storageKey ?? item.id)}` : undefined);
	const name = item.filename || item.alt || item.id || t`Untitled`;

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={cn(
				"flex items-center gap-2 border rounded-lg bg-kumo-base p-2",
				isDragging && "opacity-50 ring-2 ring-kumo-brand",
			)}
		>
			<DotsSixVertical
				className="h-4 w-4 text-kumo-subtle cursor-grab shrink-0"
				{...attributes}
				{...listeners}
			/>
			{kind === "image" ? (
				imageBroken || !displayUrl ? (
					<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border bg-kumo-muted text-kumo-subtle">
						<ImageBroken className="h-5 w-5" />
					</div>
				) : (
					<img
						src={displayUrl}
						alt={item.alt ?? ""}
						className="h-12 w-12 shrink-0 rounded-md border object-cover"
						onError={() => setImageBroken(true)}
					/>
				)
			) : (
				<span className="text-2xl shrink-0" aria-hidden="true">
					{getFileIcon(item.mimeType ?? "")}
				</span>
			)}
			<span className="text-sm flex-1 truncate">{name}</span>
			{onRemove && (
				<Button
					variant="ghost"
					shape="square"
					onClick={onRemove}
					aria-label={t`Remove item ${index + 1}`}
				>
					<Trash className="h-3.5 w-3.5 text-kumo-danger" />
				</Button>
			)}
		</div>
	);
}
