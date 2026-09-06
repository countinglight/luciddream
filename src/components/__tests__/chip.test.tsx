import { fireEvent, render, screen } from '@testing-library/react-native';

import { Chip } from '../chip';

describe('Chip', () => {
  it('renders its label', async () => {
    await render(<Chip label="5m" selected={false} onPress={() => {}} />);

    expect(screen.getByText('5m')).toBeOnTheScreen();
  });

  it('calls onPress when tapped', async () => {
    const onPress = jest.fn();
    await render(<Chip label="5m" selected={false} onPress={onPress} />);

    fireEvent.press(screen.getByText('5m'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('exposes its selected state for accessibility tooling', async () => {
    await render(<Chip label="5m" selected onPress={() => {}} />);

    expect(screen.getByRole('button').props.accessibilityState).toMatchObject({ selected: true });
  });
});
