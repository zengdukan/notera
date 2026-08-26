/** @jsxImportSource @emotion/react */
import { Component } from 'react';

import { css } from '@emotion/react';

import Button from '@atlaskit/button/standard-button';
import DropdownMenu, {
  DropdownItem,
  DropdownItemGroup,
} from '@atlaskit/dropdown-menu';
import ChevronDownIcon from '@atlaskit/icon/core/chevron-down';
import GlobeIcon from '@atlaskit/icon/core/globe';
import { token } from '@atlaskit/tokens';

const dropdownContainer = css({
  marginRight: token('space.100', '8px'),
  minWidth: '200px',
});

export interface LanguagePickerProps<Locale extends string> {
  locale: Locale;
  languages: Record<Locale, string>;
  onChange: (locale: Locale) => void;
}

export default class LanguagePicker<Locale extends string> extends Component<
  LanguagePickerProps<Locale>
> {
  render() {
    const { languages, locale } = this.props;

    return (
      <div css={dropdownContainer}>
        <DropdownMenu
          label="Editor language"
          trigger={({ triggerRef, ...providedProps }) => (
            <Button
              {...providedProps}
              ref={triggerRef}
              iconBefore={<GlobeIcon label="" />}
              iconAfter={<ChevronDownIcon label="" />}
              shouldFitContainer
            >
              {languages[locale]}
            </Button>
          )}
        >
          <DropdownItemGroup>
            {(Object.keys(languages) as Locale[]).map((language) => (
              <DropdownItem
                isSelected={language === locale}
                key={language}
                onClick={() => this.handleClick(language)}
              >
                {languages[language]}
              </DropdownItem>
            ))}
          </DropdownItemGroup>
        </DropdownMenu>
      </div>
    );
  }

  private handleClick = (locale: Locale) => {
    this.props.onChange(locale);
  };
}
