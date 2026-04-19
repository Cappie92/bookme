"""expand_blog_post_model_with_seo

Revision ID: 071a4eccd6d9
Revises: 07de82665594
Create Date: 2025-07-08 18:32:22.921252

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '071a4eccd6d9'
down_revision: Union[str, None] = '07de82665594'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    # Прерванный прогон мог оставить blog_posts_new после create_table без swap/drop — иначе повторный create падает.
    op.execute(sa.text("DROP TABLE IF EXISTS blog_posts_new"))

    insp = sa.inspect(bind)
    existing_cols = {c["name"] for c in insp.get_columns("blog_posts")}

    # legacy: is_published; ORM/create_all drift: status без is_published
    if "status" in existing_cols:
        status_sql = "COALESCE(CAST(status AS TEXT), 'draft')"
    elif "is_published" in existing_cols:
        status_sql = "CASE WHEN is_published = 1 THEN 'published' ELSE 'draft' END"
    else:
        status_sql = "'draft'"

    if "slug" in existing_cols:
        slug_sql = "slug"
    else:
        slug_sql = "('post-' || CAST(id AS TEXT))"

    # Создаем новую таблицу с расширенной структурой
    op.create_table(
        'blog_posts_new',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('subtitle', sa.String(), nullable=True),
        sa.Column('slug', sa.String(), nullable=False),
        sa.Column('excerpt', sa.String(length=160), nullable=True),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('author_id', sa.Integer(), nullable=False),
        sa.Column('cover_image', sa.String(), nullable=True),
        sa.Column('cover_image_alt', sa.String(), nullable=True),
        sa.Column('tags', sa.JSON(), nullable=True),
        sa.Column('meta_title', sa.String(), nullable=True),
        sa.Column('meta_description', sa.String(length=160), nullable=True),
        sa.Column('canonical_url', sa.String(), nullable=True),
        sa.Column('robots_noindex', sa.Boolean(), nullable=True),
        sa.Column('robots_nofollow', sa.Boolean(), nullable=True),
        sa.Column('og_title', sa.String(), nullable=True),
        sa.Column('og_description', sa.String(), nullable=True),
        sa.Column('og_image', sa.String(), nullable=True),
        sa.Column('twitter_title', sa.String(), nullable=True),
        sa.Column('twitter_description', sa.String(), nullable=True),
        sa.Column('twitter_image', sa.String(), nullable=True),
        sa.Column('json_ld', sa.JSON(), nullable=True),
        sa.Column('status', sa.String(), nullable=True),
        sa.Column('published_at', sa.DateTime(), nullable=True),
        sa.Column('scheduled_at', sa.DateTime(), nullable=True),
        sa.Column('seo_score', sa.Integer(), nullable=True),
        sa.Column('word_count', sa.Integer(), nullable=True),
        sa.Column('reading_time', sa.Integer(), nullable=True),
        sa.Column('keyword_density', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['author_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Копируем данные из старой таблицы
    op.execute(
        f"""
        INSERT INTO blog_posts_new (id, title, slug, content, author_id, created_at, updated_at, status)
        SELECT id, title, {slug_sql}, content, author_id, created_at, updated_at,
               {status_sql}
        FROM blog_posts
        """
    )
    
    # Удаляем старую таблицу
    op.drop_table('blog_posts')
    
    # Переименовываем новую таблицу
    op.rename_table('blog_posts_new', 'blog_posts')
    
    # Создаем индексы
    op.create_index(op.f('ix_blog_posts_slug'), 'blog_posts', ['slug'], unique=True)


def downgrade() -> None:
    # Создаем старую таблицу
    op.create_table(
        'blog_posts_old',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(), nullable=True),
        sa.Column('content', sa.Text(), nullable=True),
        sa.Column('author_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('is_published', sa.Boolean(), nullable=True),
        sa.ForeignKeyConstraint(['author_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Копируем данные обратно
    op.execute("""
        INSERT INTO blog_posts_old (id, title, content, author_id, created_at, updated_at, is_published)
        SELECT id, title, content, author_id, created_at, updated_at,
               CASE WHEN status = 'published' THEN 1 ELSE 0 END
        FROM blog_posts
    """)
    
    # Удаляем новую таблицу
    op.drop_table('blog_posts')
    
    # Переименовываем старую таблицу
    op.rename_table('blog_posts_old', 'blog_posts')
