import { useState } from "react";
import { initialState, deriveBuyBox } from "./buyBoxState";
import { copy } from "./copy";
import { CheckCircleIcon, StarIcon } from "./icons";
import { PurchaseOptions } from "./PurchaseOptions";
import { QuantityStepper } from "./QuantityStepper";
import { ReferenceOverlay } from "./ReferenceOverlay";

export function BuyBox() {
  const [state, setState] = useState(initialState);
  const derived = deriveBuyBox(state);

  return (
    <div className="min-h-screen bg-bb-page">
      <main className="relative mx-auto grid max-w-[1200px] gap-8 px-4 pt-14 pb-14 lg:grid-cols-[540fr_468fr] lg:gap-16 lg:px-16">
        <div className="flex aspect-square items-center justify-center overflow-hidden rounded-[19.5px] border border-bb-line bg-white">
          <img src="/product.jpg" alt="Vitamin D bottle, 60 softgels" width={1024} height={1024} className="w-[93%]" />
        </div>

        <div className="min-w-0">
          <p className="text-[12px]/[15px] font-semibold tracking-[0.14em] text-bb-muted uppercase">{copy.eyebrow}</p>

          <div className="mt-[11px] flex items-center">
            <div role="img" aria-label={`Rated ${copy.rating} out of 5`} className="flex gap-0.5 text-bb-star">
              <StarIcon />
              <StarIcon />
              <StarIcon />
              <StarIcon />
              <StarIcon />
            </div>
            <span className="ml-2 text-[14px]/[22px] font-semibold text-bb-ink" aria-hidden="true">
              {copy.rating}
            </span>
            <a href="#reviews" className="ml-2 text-[14px]/[22px] text-bb-muted underline underline-offset-[3px]">
              {copy.reviewCount}
            </a>
          </div>

          <h1 className="mt-[7.5px] font-display text-[44px]/[52px] font-medium tracking-[-0.01em] text-bb-forest">{copy.title}</h1>
          <p className="mt-[10.25px] max-w-[440px] text-[16px]/[24.8px] text-bb-body">{copy.subtitle}</p>

          <hr className="mt-[28.25px] mb-6 border-bb-line" />

          <PurchaseOptions
            option={state.option}
            frequency={state.frequency}
            oneTimePrice={derived.oneTimePrice}
            subscribePrice={derived.subscribePrice}
            comparePrice={derived.comparePrice}
            onOptionChange={(option) => setState((current) => ({ ...current, option }))}
            onFrequencyChange={(frequency) => setState((current) => ({ ...current, frequency }))}
          />

          <div className="mt-6 flex gap-3">
            <QuantityStepper
              quantity={state.quantity}
              atMin={derived.atMinQuantity}
              atMax={derived.atMaxQuantity}
              onChange={(quantity) => setState((current) => ({ ...current, quantity }))}
            />
            <button
              type="button"
              className="flex h-14 min-w-0 flex-1 items-center justify-center gap-[11px] rounded-[11.5px] bg-bb-forest text-base font-semibold text-white hover:bg-forest-dark"
            >
              {copy.addToCart}
              <span aria-hidden="true" className="size-[3px] rounded-full bg-white/60" />
              <span>{derived.total}</span>
            </button>
          </div>

          <ul className="mt-[17px] flex flex-wrap gap-x-6 gap-y-2">
            {copy.trust.map((item) => (
              <li key={item} className="flex items-center gap-1.5 text-[13px]/[22px] font-medium text-bb-body">
                <span className="shrink-0 text-bb-forest">
                  <CheckCircleIcon />
                </span>
                {item}
              </li>
            ))}
          </ul>

          {derived.finePrint && <p className="mt-[12.5px] text-[12px]/[18.5px] text-bb-muted">{derived.finePrint}</p>}
        </div>

        <ReferenceOverlay />
      </main>
    </div>
  );
}
