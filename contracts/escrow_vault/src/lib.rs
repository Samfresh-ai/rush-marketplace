#![cfg_attr(not(feature = "std"), no_std)]

use ink_lang as ink;

#[ink::contract]
mod escrow_vault {
    use ink_storage::{traits::{PackedLayout, SpreadAllocate, SpreadLayout}, Mapping};

    #[derive(scale::Encode, scale::Decode, SpreadLayout, PackedLayout, Clone, Copy, Debug, PartialEq, Eq)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo, ink_storage::traits::StorageLayout))]
    pub struct Bounty {
        amount: Balance,
        human: AccountId,
        released: bool,
    }

    #[derive(scale::Encode, scale::Decode, Clone, Copy, Debug, PartialEq, Eq)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
    pub enum Error {
        ZeroBounty,
        TaskAlreadyLocked,
        TaskNotFound,
        AlreadyReleased,
        Unauthorized,
        ZeroWinner,
        TransferFailed,
    }

    #[ink(storage)]
    #[derive(SpreadAllocate)]
    pub struct EscrowVault {
        bounties: Mapping<[u8; 32], Bounty>,
    }

    impl EscrowVault {
        #[ink(constructor, payable)]
        pub fn new() -> Self {
            ink_lang::utils::initialize_contract(|_| {})
        }

        #[ink(message, payable)]
        pub fn lock_bounty(&mut self, task_id: [u8; 32]) -> Result<(), Error> {
            let amount = self.env().transferred_value();
            if amount == 0 {
                return Err(Error::ZeroBounty);
            }

            if self.bounties.get(&task_id).is_some() {
                return Err(Error::TaskAlreadyLocked);
            }

            let human = self.env().caller();
            self.bounties.insert(
                &task_id,
                &Bounty {
                    amount,
                    human,
                    released: false,
                },
            );

            Ok(())
        }

        #[ink(message)]
        pub fn release_bounty(
            &mut self,
            task_id: [u8; 32],
            winner: AccountId,
        ) -> Result<(), Error> {
            let mut bounty = self.bounties.get(&task_id).ok_or(Error::TaskNotFound)?;
            if bounty.released {
                return Err(Error::AlreadyReleased);
            }

            if self.env().caller() != bounty.human {
                return Err(Error::Unauthorized);
            }

            if winner == AccountId::from([0u8; 32]) {
                return Err(Error::ZeroWinner);
            }

            self.env()
                .transfer(winner, bounty.amount)
                .map_err(|_| Error::TransferFailed)?;

            bounty.released = true;
            self.bounties.insert(&task_id, &bounty);

            Ok(())
        }

        #[ink(message)]
        pub fn get_bounty(&self, task_id: [u8; 32]) -> Balance {
            match self.bounties.get(&task_id) {
                Some(bounty) if !bounty.released => bounty.amount,
                _ => 0,
            }
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use ink_env::test;

        type Environment = ink_env::DefaultEnvironment;

        fn accounts() -> test::DefaultAccounts<Environment> {
            test::default_accounts::<Environment>()
        }

        fn set_caller(caller: AccountId) {
            test::set_caller::<Environment>(caller);
        }

        fn set_transferred_value(value: Balance) {
            test::set_value_transferred::<Environment>(value);
        }

        fn task_id(byte: u8) -> [u8; 32] {
            [byte; 32]
        }

        fn lock(contract: &mut EscrowVault, task_id: [u8; 32], amount: Balance) {
            set_transferred_value(amount);
            assert_eq!(contract.lock_bounty(task_id), Ok(()));
            set_transferred_value(0);
        }

        #[ink_lang::test]
        fn can_lock_bounty_for_a_task() {
            let accts = accounts();
            set_caller(accts.alice);
            let mut contract = EscrowVault::new();
            let id = task_id(1);

            lock(&mut contract, id, 100);

            assert_eq!(contract.get_bounty(id), 100);
        }

        #[ink_lang::test]
        fn cannot_lock_zero_pot() {
            let mut contract = EscrowVault::new();
            set_transferred_value(0);

            assert_eq!(contract.lock_bounty(task_id(1)), Err(Error::ZeroBounty));
        }

        #[ink_lang::test]
        fn cannot_lock_same_task_id_twice() {
            let accts = accounts();
            set_caller(accts.alice);
            let mut contract = EscrowVault::new();
            let id = task_id(2);

            lock(&mut contract, id, 100);
            set_transferred_value(50);

            assert_eq!(contract.lock_bounty(id), Err(Error::TaskAlreadyLocked));
        }

        #[ink_lang::test]
        fn can_release_bounty_to_winner() {
            let accts = accounts();
            set_caller(accts.alice);
            let mut contract = EscrowVault::new();
            let id = task_id(3);

            lock(&mut contract, id, 100);
            assert_eq!(contract.release_bounty(id, accts.bob), Ok(()));

            assert_eq!(contract.get_bounty(id), 0);
        }

        #[ink_lang::test]
        fn cannot_release_before_locking() {
            let accts = accounts();
            set_caller(accts.alice);
            let mut contract = EscrowVault::new();

            assert_eq!(
                contract.release_bounty(task_id(4), accts.bob),
                Err(Error::TaskNotFound)
            );
        }

        #[ink_lang::test]
        fn cannot_release_same_task_id_twice() {
            let accts = accounts();
            set_caller(accts.alice);
            let mut contract = EscrowVault::new();
            let id = task_id(5);

            lock(&mut contract, id, 100);
            assert_eq!(contract.release_bounty(id, accts.bob), Ok(()));
            assert_eq!(contract.release_bounty(id, accts.bob), Err(Error::AlreadyReleased));
        }

        #[ink_lang::test]
        fn cannot_release_to_zero_default_account_id() {
            let accts = accounts();
            set_caller(accts.alice);
            let mut contract = EscrowVault::new();
            let id = task_id(6);

            lock(&mut contract, id, 100);

            assert_eq!(
                contract.release_bounty(id, AccountId::from([0u8; 32])),
                Err(Error::ZeroWinner)
            );
        }

        #[ink_lang::test]
        fn only_original_locker_can_release() {
            let accts = accounts();
            set_caller(accts.alice);
            let mut contract = EscrowVault::new();
            let id = task_id(7);

            lock(&mut contract, id, 100);
            set_caller(accts.charlie);

            assert_eq!(contract.release_bounty(id, accts.bob), Err(Error::Unauthorized));
        }

        #[ink_lang::test]
        fn get_bounty_returns_locked_amount_before_release() {
            let accts = accounts();
            set_caller(accts.alice);
            let mut contract = EscrowVault::new();
            let id = task_id(8);

            lock(&mut contract, id, 250);

            assert_eq!(contract.get_bounty(id), 250);
        }

        #[ink_lang::test]
        fn get_bounty_returns_zero_after_release() {
            let accts = accounts();
            set_caller(accts.alice);
            let mut contract = EscrowVault::new();
            let id = task_id(9);

            lock(&mut contract, id, 250);
            assert_eq!(contract.release_bounty(id, accts.bob), Ok(()));

            assert_eq!(contract.get_bounty(id), 0);
        }

        #[ink_lang::test]
        fn contract_balance_decreases_after_release() {
            let accts = accounts();
            set_caller(accts.alice);
            let contract_account = test::callee::<Environment>();
            test::set_account_balance::<Environment>(contract_account, 1_000_000);
            test::set_account_balance::<Environment>(accts.bob, 2_000_000);
            let mut contract = EscrowVault::new();
            let id = task_id(10);

            lock(&mut contract, id, 500);
            assert_eq!(contract.release_bounty(id, accts.bob), Ok(()));

            assert_eq!(test::get_account_balance::<Environment>(contract_account), Ok(999_500));
        }

        #[ink_lang::test]
        fn winner_balance_increases_after_release() {
            let accts = accounts();
            set_caller(accts.alice);
            let contract_account = test::callee::<Environment>();
            test::set_account_balance::<Environment>(contract_account, 1_000_000);
            test::set_account_balance::<Environment>(accts.bob, 2_000_000);
            let mut contract = EscrowVault::new();
            let id = task_id(11);

            lock(&mut contract, id, 500);
            assert_eq!(contract.release_bounty(id, accts.bob), Ok(()));

            assert_eq!(test::get_account_balance::<Environment>(accts.bob), Ok(2_000_500));
        }
    }
}
