import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import NebuliPanel from '../NebuliPanel.vue';

// Mock canvas getContext to avoid vitest-jsdom errors
HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
  createLinearGradient: vi.fn().mockReturnValue({
    addColorStop: vi.fn()
  }),
  createRadialGradient: vi.fn().mockReturnValue({
    addColorStop: vi.fn()
  })
});

// Mock requestAnimationFrame
global.requestAnimationFrame = vi.fn().mockReturnValue(1);
global.cancelAnimationFrame = vi.fn();

describe('NebuliPanel.vue', () => {
  it('renders properly and shows section header', () => {
    const wrapper = mount(NebuliPanel);
    expect(wrapper.text()).toContain('NEBULI GRANULAR CLOUD REVERB');
  });

  it('contains essential granular parameters knobs', () => {
    const wrapper = mount(NebuliPanel);
    const html = wrapper.html();
    
    expect(html).toContain('nebuli_grain_count');
    expect(html).toContain('nebuli_grain_size');
    expect(html).toContain('nebuli_grain_size_rand');
    expect(html).toContain('nebuli_grain_position_rand');
    expect(html).toContain('nebuli_speed');
    expect(html).toContain('nebuli_detune');
  });

  it('renders disabled state text when bypassed', async () => {
    const wrapper = mount(NebuliPanel);
    
    // Initial bypass overlay state is bypassed because state.enable starts as false
    expect(wrapper.find('.absolute.inset-0.bg-\\[\\#030408\\].bg-opacity-65').exists);
    expect(wrapper.text()).toContain('NEBULI BYPASSED');
  });
});
