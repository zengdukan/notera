import FolderClosedIcon from '@atlaskit/icon/core/folder-closed';
import FolderOpenIcon from '@atlaskit/icon/core/folder-open';
import { Box, Text, xcss } from '@atlaskit/primitives';
import { ButtonMenuItem } from '@atlaskit/side-nav-items/button-menu-item';
import {
  ExpandableMenuItem,
  ExpandableMenuItemContent,
  ExpandableMenuItemTrigger,
  useIsExpanded,
} from '@atlaskit/side-nav-items/expandable-menu-item';
import { MenuList } from '@atlaskit/side-nav-items/menu-list';

const folderPickerScrollStyles = xcss({
  maxHeight: '320px',
  overflowX: 'hidden',
  overflowY: 'auto',
  paddingBlock: 'space.025',
});

export interface FolderPickerItem {
  readonly id: string;
  readonly name: string;
  readonly depth: number;
}

interface FolderPickerNode {
  readonly item: FolderPickerItem;
  readonly children: FolderPickerNode[];
}

function buildFolderTree(
  folders: readonly FolderPickerItem[],
): readonly FolderPickerNode[] {
  const roots: FolderPickerNode[] = [];
  const ancestors: FolderPickerNode[] = [];

  for (const item of folders) {
    const node: FolderPickerNode = { item, children: [] };
    const parent = item.depth > 0 ? ancestors[item.depth - 1] : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
    ancestors[item.depth] = node;
    ancestors.length = item.depth + 1;
  }

  return roots;
}

function ExpandableFolderIcon() {
  const isExpanded = useIsExpanded();
  const Icon = isExpanded ? FolderOpenIcon : FolderClosedIcon;
  return <Icon label="" />;
}

function FolderPickerRow({
  node,
  disabledIds,
  value,
  onChange,
}: {
  readonly node: FolderPickerNode;
  readonly disabledIds: ReadonlySet<string>;
  readonly value: string;
  readonly onChange: (folderId: string) => void;
}) {
  const disabled = disabledIds.has(node.item.id);
  const label = (
    <Text color={disabled ? 'color.text.disabled' : 'color.text'}>
      {node.item.name}
    </Text>
  );

  if (node.children.length === 0) {
    return (
      <ButtonMenuItem
        elemBefore={<FolderClosedIcon label="" />}
        isDisabled={disabled}
        isSelected={value === node.item.id}
        onClick={() => onChange(node.item.id)}
      >
        {label}
      </ButtonMenuItem>
    );
  }

  return (
    <ExpandableMenuItem isDefaultExpanded>
      <ExpandableMenuItemTrigger
        elemBefore={<ExpandableFolderIcon />}
        isSelected={value === node.item.id}
        onClick={() => {
          if (!disabled) onChange(node.item.id);
        }}
      >
        {label}
      </ExpandableMenuItemTrigger>
      <ExpandableMenuItemContent>
        {node.children.map((child) => (
          <FolderPickerRow
            key={child.item.id}
            node={child}
            disabledIds={disabledIds}
            value={value}
            onChange={onChange}
          />
        ))}
      </ExpandableMenuItemContent>
    </ExpandableMenuItem>
  );
}

export function FolderPicker({
  rootFolderId,
  folders,
  disabledIds,
  value,
  onChange,
}: {
  readonly rootFolderId: string;
  readonly folders: readonly FolderPickerItem[];
  readonly disabledIds: ReadonlySet<string>;
  readonly value: string;
  readonly onChange: (folderId: string) => void;
}) {
  const nodes = buildFolderTree(folders);
  const rootLabel = <Text>Root</Text>;

  return (
    <Box xcss={folderPickerScrollStyles} testId="folder-picker-scroll">
      <MenuList>
        {nodes.length > 0 ? (
          <ExpandableMenuItem isDefaultExpanded>
            <ExpandableMenuItemTrigger
              elemBefore={<ExpandableFolderIcon />}
              isSelected={value === rootFolderId}
              onClick={() => onChange(rootFolderId)}
            >
              {rootLabel}
            </ExpandableMenuItemTrigger>
            <ExpandableMenuItemContent>
              {nodes.map((node) => (
                <FolderPickerRow
                  key={node.item.id}
                  node={node}
                  disabledIds={disabledIds}
                  value={value}
                  onChange={onChange}
                />
              ))}
            </ExpandableMenuItemContent>
          </ExpandableMenuItem>
        ) : (
          <ButtonMenuItem
            elemBefore={<FolderClosedIcon label="" />}
            isSelected={value === rootFolderId}
            onClick={() => onChange(rootFolderId)}
          >
            {rootLabel}
          </ButtonMenuItem>
        )}
      </MenuList>
    </Box>
  );
}
