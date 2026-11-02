// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { InMemoryKeyValueStore } from '../fakes';
import { city, renderStack, renderWithFakeController } from './helpers';

const celsius = () => screen.getByRole('radio', { name: '°C' }) as HTMLInputElement;
const fahrenheit = () => screen.getByRole('radio', { name: '°F' }) as HTMLInputElement;
const current = () => screen.getByRole('region', { name: 'Current weather' });

describe('Temperature unit toggle (TASK-033)', () => {
  it('is a labeled group with Celsius selected by default', () => {
    renderWithFakeController();
    expect(screen.getByRole('group', { name: 'Temperature unit' })).toBeTruthy();
    expect(celsius().checked).toBe(true);
    expect(fahrenheit().checked).toBe(false);
  });

  it('choosing Fahrenheit sends the intent', async () => {
    const user = userEvent.setup();
    const { controller } = renderWithFakeController();
    await user.click(fahrenheit());
    expect(controller.setTemperatureUnit).toHaveBeenCalledWith('F');
  });

  it('is operable from the keyboard', async () => {
    const user = userEvent.setup();
    const { controller } = renderWithFakeController();
    celsius().focus();
    await user.keyboard('{ArrowRight}');
    expect(controller.setTemperatureUnit).toHaveBeenCalledWith('F');
  });

  it('changes the displayed values and units everywhere', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    await act(() => t.controller.chooseCandidate(city(1)));
    expect(within(current()).getByText('22°C')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Forecast' }).textContent).toContain('High 20°C, Low 10°C');
    await user.click(fahrenheit());
    await waitFor(() => expect(within(current()).getByText('71°F')).toBeTruthy());
    expect(fahrenheit().checked).toBe(true);
    expect(screen.getByRole('region', { name: 'Forecast' }).textContent).toContain('High 68°F, Low 50°F');
  });

  it('persists across a remount over the same storage', async () => {
    const user = userEvent.setup();
    const kv = new InMemoryKeyValueStore();
    const first = renderStack({ kv });
    await user.click(fahrenheit());
    await waitFor(() => expect(fahrenheit().checked).toBe(true));
    first.unmount();

    const second = renderStack({ kv });
    await act(() => second.controller.start());
    expect(fahrenheit().checked).toBe(true);
    await act(() => second.controller.chooseCandidate(city(1)));
    expect(within(current()).getByText('71°F')).toBeTruthy();
  });

  it('still works for the session, with a notice, when the choice cannot be saved', async () => {
    const user = userEvent.setup();
    const kv = new InMemoryKeyValueStore();
    kv.failAll();
    renderStack({ kv });
    await user.click(fahrenheit());
    await waitFor(() => expect(fahrenheit().checked).toBe(true));
    expect(await screen.findByText('Your temperature unit will not be remembered on this device.')).toBeTruthy();
  });
});
