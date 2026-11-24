import type { Ctx } from "../ctx.ts";
import { WISDOM } from "../links.ts";
import { openExternal } from "../env.ts";

const go = (url: string) => (e: React.MouseEvent) => { e.preventDefault(); openExternal(url); };

export function Wisdom({ c }: { c: Ctx }) {
  const work = c.account.holdings.work;
  return (
    <div>
      <section className="card wisdom">
        <div className="wisdom-mark">Wisdom<span>.</span></div>
        <p>The Working Dead's learn-to-earn platform. Free and paid courses from independent instructors, daily streaks and missions, with rewards in $WORK.</p>
        <button className="primary wide" onClick={go(WISDOM.courses)}>Browse courses ↗</button>
        <p className="small">
          Your wallet holds <b>{work.toLocaleString("en-GB")} $WORK</b>
          {c.account.holdings.skulls.length > 0 && <> and <b>{c.account.holdings.skulls.length}</b> Genesis skull{c.account.holdings.skulls.length > 1 ? "s" : ""}</>}.
        </p>
      </section>
      <section className="card">
        <h2>Teach</h2>
        <p className="small">Build and sell a course with the Course Builder.</p>
        <div className="links">
          <a href="#" onClick={go(WISDOM.creators)}>Become an instructor ↗</a>
          <a href="#" onClick={go(WISDOM.instructors)}>Instructors ↗</a>
          <a href="#" onClick={go(WISDOM.docs)}>Docs ↗</a>
          <a href="#" onClick={go(WISDOM.x)}>Wisdom. on X ↗</a>
        </div>
      </section>
    </div>
  );
}
