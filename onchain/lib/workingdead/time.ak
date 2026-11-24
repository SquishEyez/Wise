//// Time helpers shared by validators. All times are POSIX milliseconds.

use aiken/interval.{Finite, Interval, IntervalBound}
use cardano/transaction.{ValidityRange}

/// True when the whole validity range starts at or after `t`,
/// i.e. the transaction provably happens no earlier than `t`.
pub fn starts_after(range: ValidityRange, t: Int) -> Bool {
  when range.lower_bound.bound_type is {
    Finite(lo) -> lo >= t
    _ -> False
  }
}

test starts_after_ok() {
  let r = Interval {
    lower_bound: IntervalBound { bound_type: Finite(2000), is_inclusive: True },
    upper_bound: IntervalBound {
      bound_type: interval.PositiveInfinity,
      is_inclusive: True,
    },
  }
  starts_after(r, 1000)
}

test starts_after_too_early() {
  let r = interval.after(500)
  !starts_after(r, 1000)
}

test starts_after_unbounded_fails() {
  !starts_after(interval.everything, 0)
}
