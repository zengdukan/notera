/** @jsxImportSource @emotion/react */
import Button from '@atlaskit/button/standard-button';
import DataFlowIcon from '@atlaskit/icon/core/data-flow';
import Tooltip from '@atlaskit/tooltip';

import { toolbarButtonContainerStyles } from './styles';

type MermaidToolbarButtonProps = {
  isDisabled?: boolean;
  onClick: () => void;
};

export function MermaidToolbarButton({
  isDisabled = false,
  onClick,
}: MermaidToolbarButtonProps) {
  return (
    <div css={toolbarButtonContainerStyles}>
      <Tooltip content="Insert Mermaid diagram" position="bottom">
        <Button
          aria-label="Insert Mermaid diagram"
          appearance="subtle"
          iconBefore={<DataFlowIcon label="" />}
          isDisabled={isDisabled}
          onClick={onClick}
        >
          Mermaid
        </Button>
      </Tooltip>
    </div>
  );
}
