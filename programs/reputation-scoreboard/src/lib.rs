use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod reputation_scoreboard {
    use super::*;

    pub fn initialize_board(
        ctx: Context<InitializeBoard>,
        cooldown: i64,
        top_contributor_threshold: i64,
    ) -> Result<()> {
        let board = &mut ctx.accounts.board;
        board.authority = ctx.accounts.authority.key();
        board.cooldown = cooldown;
        board.token_mint = ctx.accounts.token_mint.key();
        board.top_contributor_threshold = top_contributor_threshold;

        // Emit event
        emit!(BoardInitializedEvent {
            authority: board.authority,
            cooldown,
            token_mint: board.token_mint,
            threshold: top_contributor_threshold,
        });

        Ok(())
    }

    pub fn upvote(ctx: Context<Vote>) -> Result<()> {
        // Check token balance
        if ctx.accounts.voter_token_account.amount == 0 {
            return err!(ErrorCode::InsufficientTokenBalance);
        }

        // Check if the token account belongs to the correct mint
        if ctx.accounts.voter_token_account.mint != ctx.accounts.board.token_mint {
            return err!(ErrorCode::InvalidTokenMint);
        }

        // Check cooldown
        let current_time = Clock::get()?.unix_timestamp;
        let vote_record = &mut ctx.accounts.vote_record;

        if vote_record.last_vote_timestamp > 0 {
            let time_since_last_vote = current_time - vote_record.last_vote_timestamp;
            if time_since_last_vote < ctx.accounts.board.cooldown {
                return err!(ErrorCode::CooldownNotPassed);
            }
        }

        // Initialize vote record if new
        if vote_record.last_vote_timestamp == 0 {
            vote_record.voter = ctx.accounts.voter.key();
            vote_record.target = ctx.accounts.target.key();
        }

        // Update vote timestamp
        vote_record.last_vote_timestamp = current_time;

        // Update reputation
        let target_entry = &mut ctx.accounts.target_entry;
        if target_entry.user == Pubkey::default() {
            target_entry.user = ctx.accounts.target.key();
            target_entry.reputation = 0;
            target_entry.top_contributor = false;
        }

        target_entry.reputation += 1;

        // Emit event
        emit!(UserVotedEvent {
            voter: ctx.accounts.voter.key(),
            target: ctx.accounts.target.key(),
            action: "upvote".to_string(),
            new_score: target_entry.reputation,
        });

        Ok(())
    }

    pub fn downvote(ctx: Context<Vote>) -> Result<()> {
        // Check token balance
        if ctx.accounts.voter_token_account.amount == 0 {
            return err!(ErrorCode::InsufficientTokenBalance);
        }

        // Check if the token account belongs to the correct mint
        if ctx.accounts.voter_token_account.mint != ctx.accounts.board.token_mint {
            return err!(ErrorCode::InvalidTokenMint);
        }

        // Check cooldown
        let current_time = Clock::get()?.unix_timestamp;
        let vote_record = &mut ctx.accounts.vote_record;

        if vote_record.last_vote_timestamp > 0 {
            let time_since_last_vote = current_time - vote_record.last_vote_timestamp;
            if time_since_last_vote < ctx.accounts.board.cooldown {
                return err!(ErrorCode::CooldownNotPassed);
            }
        }

        // Initialize vote record if new
        if vote_record.last_vote_timestamp == 0 {
            vote_record.voter = ctx.accounts.voter.key();
            vote_record.target = ctx.accounts.target.key();
        }

        // Update vote timestamp
        vote_record.last_vote_timestamp = current_time;

        // Update reputation
        let target_entry = &mut ctx.accounts.target_entry;
        if target_entry.user == Pubkey::default() {
            target_entry.user = ctx.accounts.target.key();
            target_entry.reputation = 0;
            target_entry.top_contributor = false;
        }

        target_entry.reputation -= 1;

        // Emit event
        emit!(UserVotedEvent {
            voter: ctx.accounts.voter.key(),
            target: ctx.accounts.target.key(),
            action: "downvote".to_string(),
            new_score: target_entry.reputation,
        });

        Ok(())
    }

    pub fn reset_score(ctx: Context<ResetScore>) -> Result<()> {
        // Check authority
        if ctx.accounts.authority.key() != ctx.accounts.board.authority {
            return err!(ErrorCode::NotAuthorized);
        }

        // Reset reputation
        let target_entry = &mut ctx.accounts.target_entry;
        target_entry.reputation = 0;
        target_entry.top_contributor = false;

        // Emit event
        emit!(ScoreResetEvent {
            authority: ctx.accounts.authority.key(),
            target: ctx.accounts.target.key(),
        });

        Ok(())
    }

    pub fn unlock_role(ctx: Context<UnlockRole>) -> Result<()> {
        let user_entry = &mut ctx.accounts.user_entry;
        let threshold = ctx.accounts.board.top_contributor_threshold;

        // Check if reputation meets threshold
        if user_entry.reputation < threshold {
            return err!(ErrorCode::InsufficientReputation);
        }

        // Set top contributor flag
        if !user_entry.top_contributor {
            user_entry.top_contributor = true;

            // Emit event
            emit!(RoleUnlockedEvent {
                user: ctx.accounts.user.key(),
                role: "top_contributor".to_string(),
                reputation: user_entry.reputation,
            });
        }

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeBoard<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + ReputationBoard::LEN,
        seeds = [b"reputation_board"],
        bump
    )]
    pub board: Account<'info, ReputationBoard>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    /// CHECK: This is just used to store the mint address
    pub token_mint: UncheckedAccount<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Vote<'info> {
    #[account(seeds = [b"reputation_board"], bump)]
    pub board: Account<'info, ReputationBoard>,
    
    #[account(
        init_if_needed,
        payer = voter,
        space = 8 + ReputationEntry::LEN,
        seeds = [b"reputation_entry", target.key().as_ref()],
        bump
    )]
    pub target_entry: Account<'info, ReputationEntry>,
    
    #[account(
        init_if_needed,
        payer = voter,
        space = 8 + VoteRecord::LEN,
        seeds = [b"vote_record", voter.key().as_ref(), target.key().as_ref()],
        bump
    )]
    pub vote_record: Account<'info, VoteRecord>,
    
    #[account(mut)]
    pub voter: Signer<'info>,
    
    /// CHECK: This is just the target pubkey
    pub target: UncheckedAccount<'info>,
    
    /// The token account owned by the voter
    pub voter_token_account: Box<Account<'info, TokenAccount>>,
    
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ResetScore<'info> {
    #[account(seeds = [b"reputation_board"], bump)]
    pub board: Account<'info, ReputationBoard>,
    
    #[account(
        mut,
        seeds = [b"reputation_entry", target.key().as_ref()],
        bump
    )]
    pub target_entry: Account<'info, ReputationEntry>,
    
    pub authority: Signer<'info>,
    
    /// CHECK: This is just the target pubkey
    pub target: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct UnlockRole<'info> {
    #[account(seeds = [b"reputation_board"], bump)]
    pub board: Account<'info, ReputationBoard>,
    
    #[account(
        mut,
        seeds = [b"reputation_entry", user.key().as_ref()],
        bump
    )]
    pub user_entry: Account<'info, ReputationEntry>,
    
    /// CHECK: This is just the user pubkey
    pub user: UncheckedAccount<'info>,
}

#[account]
pub struct ReputationBoard {
    pub authority: Pubkey,
    pub cooldown: i64,
    pub token_mint: Pubkey,
    pub top_contributor_threshold: i64,
}

impl ReputationBoard {
    pub const LEN: usize = 32 + 8 + 32 + 8;
}

#[account]
pub struct ReputationEntry {
    pub user: Pubkey,
    pub reputation: i64,
    pub top_contributor: bool,
}

impl ReputationEntry {
    pub const LEN: usize = 32 + 8 + 1;
}

#[account]
pub struct VoteRecord {
    pub voter: Pubkey,
    pub target: Pubkey,
    pub last_vote_timestamp: i64,
}

impl VoteRecord {
    pub const LEN: usize = 32 + 32 + 8;
}

#[error_code]
pub enum ErrorCode {
    #[msg("Cooldown period has not passed since last vote")]
    CooldownNotPassed,
    #[msg("Not authorized to perform this action")]
    NotAuthorized,
    #[msg("Insufficient reputation to unlock this role")]
    InsufficientReputation,
    #[msg("Insufficient token balance to vote")]
    InsufficientTokenBalance,
    #[msg("Invalid token mint")]
    InvalidTokenMint,
}

// Events
#[event]
pub struct BoardInitializedEvent {
    pub authority: Pubkey,
    pub cooldown: i64,
    pub token_mint: Pubkey,
    pub threshold: i64,
}

#[event]
pub struct UserVotedEvent {
    pub voter: Pubkey,
    pub target: Pubkey,
    pub action: String,
    pub new_score: i64,
}

#[event]
pub struct ScoreResetEvent {
    pub authority: Pubkey,
    pub target: Pubkey,
}

#[event]
pub struct RoleUnlockedEvent {
    pub user: Pubkey,
    pub role: String,
    pub reputation: i64,
}