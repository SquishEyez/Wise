//// VAULT — lock ADA or $WORK until a time, then only the owner may withdraw.
//// Starting point for the old "vault events" / staking utility.

use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use aiken/interval
use cardano/transaction.{OutputReference, Transaction}
use workingdead/time

pub type VaultDatum {
  owner: VerificationKeyHash,
  unlock_after: Int,
}

pub type VaultAction {
  Withdraw
}

validator vault {
  spend(
    datum: Option<VaultDatum>,
    redeemer: VaultAction,
    _own_ref: OutputReference,
    self: Transaction,
  ) {
    expect Some(d) = datum
    // Single action today; turn this into a `when` once more actions exist.
    let Withdraw = redeemer
    and {
      list.has(self.extra_signatories, d.owner),
      time.starts_after(self.validity_range, d.unlock_after),
    }
  }

  else(_) {
    fail
  }
}

// ---------- tests ----------

const owner = #"00000000000000000000000000000000000000000000000000000001"

const stranger = #"00000000000000000000000000000000000000000000000000000002"

fn oref() {
  OutputReference { transaction_id: #"", output_index: 0 }
}

test withdraw_by_owner_after_unlock() {
  let tx = Transaction {
    ..transaction.placeholder,
    extra_signatories: [owner],
    validity_range: interval.after(2000),
  }
  vault.spend(
    Some(VaultDatum { owner, unlock_after: 1000 }),
    Withdraw,
    oref(),
    tx,
  )
}

test withdraw_too_early() fail {
  let tx = Transaction {
    ..transaction.placeholder,
    extra_signatories: [owner],
    validity_range: interval.after(500),
  }
  vault.spend(
    Some(VaultDatum { owner, unlock_after: 1000 }),
    Withdraw,
    oref(),
    tx,
  )
}

test withdraw_by_stranger() fail {
  let tx = Transaction {
    ..transaction.placeholder,
    extra_signatories: [stranger],
    validity_range: interval.after(2000),
  }
  vault.spend(
    Some(VaultDatum { owner, unlock_after: 1000 }),
    Withdraw,
    oref(),
    tx,
  )
}
