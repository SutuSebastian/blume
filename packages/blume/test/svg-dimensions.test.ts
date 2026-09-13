import { describe, expect, it } from "bun:test";

import { svgDimensions } from "../src/core/svg-dimensions.ts";

// The header logo box and the OG brand mark both size an SVG through this
// parser, so every spelling it accepts or rejects shows up in two places.
describe("svgDimensions", () => {
  it("reads explicit width and height", () => {
    expect(svgDimensions('<svg width="1214" height="191"></svg>')).toEqual({
      height: 191,
      width: 1214,
    });
  });

  it("converts CSS units to pixels at 96dpi", () => {
    expect(svgDimensions('<svg width="1in" height="72pt"></svg>')).toEqual({
      height: 96,
      width: 96,
    });
    expect(svgDimensions("<svg width='2em' height='2ex'></svg>")).toEqual({
      height: 16,
      width: 32,
    });
    expect(svgDimensions('<svg width="1cm" height="10mm"></svg>')).toEqual({
      height: 38,
      width: 38,
    });
    expect(svgDimensions('<svg width="1pc" height="1m"></svg>')).toEqual({
      height: 3780,
      width: 16,
    });
    expect(svgDimensions('<svg width="1e2px" height="1e1"></svg>')).toEqual({
      height: 10,
      width: 100,
    });
  });

  it("falls back to the viewBox when no explicit size is given", () => {
    expect(svgDimensions('<svg viewBox="0 0 608 96"></svg>')).toEqual({
      height: 96,
      width: 608,
    });
    // Attribute names are matched case-insensitively for the viewBox alone.
    expect(svgDimensions('<svg viewbox="0 0 24 24"></svg>')).toEqual({
      height: 24,
      width: 24,
    });
  });

  it("scales a lone explicit length by the viewBox aspect", () => {
    expect(
      svgDimensions('<svg width="200" viewBox="0 0 400 40"></svg>')
    ).toEqual({ height: 20, width: 200 });
    expect(
      svgDimensions('<svg height="20" viewBox="0 0 400 40"></svg>')
    ).toEqual({ height: 20, width: 200 });
  });

  it("ignores percentage lengths and measures by the viewBox instead", () => {
    expect(
      svgDimensions(
        '<svg width="100%" height="100%" viewBox="0 0 36 36"></svg>'
      )
    ).toEqual({ height: 36, width: 36 });
  });

  it("tolerates newlines between attributes and a > inside a value", () => {
    expect(
      svgDimensions(
        '<svg\n  xmlns="http://www.w3.org/2000/svg"\n  data-note="a > b"\n  viewBox="0 0 12 6"\n><path d="M0 0h12v6H0z" /></svg>'
      )
    ).toEqual({ height: 6, width: 12 });
  });

  it("returns null when the root carries no usable size", () => {
    // No root tag at all.
    expect(svgDimensions("<div>not svg</div>")).toBeNull();
    // A root with no size attributes.
    expect(svgDimensions("<svg><path /></svg>")).toBeNull();
    // Comma-separated viewBox values aren't split, so no width is found.
    expect(svgDimensions('<svg viewBox="0,0,24,24"></svg>')).toBeNull();
    // A viewBox missing its height.
    expect(svgDimensions('<svg viewBox="0 0 24"></svg>')).toBeNull();
    // A zero or unparsable length is no length.
    expect(svgDimensions('<svg width="0" height="10"></svg>')).toBeNull();
    expect(svgDimensions('<svg width="auto" height="10"></svg>')).toBeNull();
    expect(svgDimensions('<svg width="1.2.3" height="10"></svg>')).toBeNull();
    // One explicit length with nothing to derive the other from.
    expect(svgDimensions('<svg width="10"></svg>')).toBeNull();
  });

  it("returns null when the viewBox aspect scales the other length to zero", () => {
    expect(
      svgDimensions('<svg width="1" viewBox="0 0 400 40"></svg>')
    ).toBeNull();
    expect(
      svgDimensions('<svg height="1" viewBox="0 0 40 400"></svg>')
    ).toBeNull();
  });
});
