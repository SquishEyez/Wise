//// COURSE BADGE — minting policy for proof-of-completion tokens.
//// Only the issuer key may mint (one of each name per tx); anyone may burn their own.

use aiken/collection/dict
use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use cardano/assets.{PolicyId}
use cardano/transaction.{Transaction}

pub type BadgeAction {
  Issue
  Burn
}

validator course_badge(issuer: VerificationKeyHash) {
  mint(redeemer: BadgeAction, policy_id: PolicyId, self: Transaction) {
    let quantities = self.mint
      |> assets.tokens(policy_id)
      |> dict.values
    when redeemer is {
      Issue -> and {
          list.has(self.extra_signatories, issuer),
          !list.is_empty(quantities),
          list.all(quantities, fn(q) { q == 1 }),
        }
      Burn -> and {
          !list.is_empty(quantities),
          list.all(quantities, fn(q) { q < 0 }),
        }
    }
  }

  else(_) {
    fail
  }
}

// ---------- tests ----------

const issuer = #"0000000000000000000000000000000000000000000000000000000a"

const pid = #"0000000000000000000000000000000000000000000000000000beef"

test issue_signed() {
  let tx = Transaction {
    ..transaction.placeholder,
    extra_signatories: [issuer],
    mint: assets.from_asset(pid, "AIKEN101", 1),
  }
  course_badge.mint(issuer, Issue, pid, tx)
}

test issue_unsigned() fail {
  let tx = Transaction {
    ..transaction.placeholder,
    mint: assets.from_asset(pid, "AIKEN101", 1),
  }
  course_badge.mint(issuer, Issue, pid, tx)
}

test issue_two_copies() fail {
  let tx = Transaction {
    ..transaction.placeholder,
    extra_signatories: [issuer],
    mint: assets.from_asset(pid, "AIKEN101", 2),
  }
  course_badge.mint(issuer, Issue, pid, tx)
}

test burn_anyone() {
  let tx = Transaction {
    ..transaction.placeholder,
    mint: assets.from_asset(pid, "AIKEN101", -1),
  }
  course_badge.mint(issuer, Burn, pid, tx)
}
